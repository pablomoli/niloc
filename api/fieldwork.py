# Generated from api_routes.py split
import logging
from datetime import datetime, timezone

from flask import jsonify, request, session
from sqlalchemy import func, or_

from api import api_bp, require_admin, validate_job_data, geocode_address
from auth_utils import login_required
from models import db, Job, Tag, FieldWork, User, job_tags
from db_utils import with_db_retry, handle_db_error
from utils import get_brevard_property_link

logger = logging.getLogger(__name__)

@api_bp.route("/jobs/<job_number>/fieldwork", methods=["GET"])
@login_required
def get_job_fieldwork(job_number):
    """GET /api/jobs/JOB123/fieldwork - Get fieldwork for job"""
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    fieldwork = (
        FieldWork.query.filter_by(job_id=job.id)
        .order_by(FieldWork.work_date.desc())
        .all()
    )
    return jsonify([fw.to_dict() for fw in fieldwork])


@api_bp.route("/jobs/<job_number>/fieldwork", methods=["POST"])
@login_required
def add_fieldwork(job_number):
    """POST /api/jobs/JOB123/fieldwork - Add fieldwork entry"""
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate required fields - now accepts total_time instead of start_time/end_time
    if not data.get("work_date"):
        return jsonify({"error": "Missing required field: work_date"}), 400
    
    if not data.get("total_time"):
        return jsonify({"error": "Missing required field: total_time"}), 400

    try:
        # Parse work date
        work_date = datetime.strptime(data["work_date"], "%Y-%m-%d").date()
        
        # Parse total_time - can be a float (hours) or string in "HH:MM" format
        total_time = data["total_time"]
        if isinstance(total_time, str):
            # Try parsing as "HH:MM" format
            if ":" in total_time:
                parts = total_time.split(":")
                if len(parts) == 2:
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    if minutes < 0 or minutes >= 60:
                        return jsonify({"error": "Minutes must be between 0 and 59"}), 400
                    total_time = hours + (minutes / 60.0)
                else:
                    return jsonify({"error": "Invalid time format. Use HH:MM (e.g., 2:30)"}), 400
            else:
                # Try parsing as float string
                total_time = float(total_time)
        else:
            total_time = float(total_time)
        
        if total_time <= 0:
            return jsonify({"error": "Total time must be greater than 0"}), 400

        # Set default start_time and end_time for database compatibility
        # Start at 00:00, end time calculated from total_time
        start_time = datetime.strptime("00:00", "%H:%M").time()
        end_hours = int(total_time)
        end_minutes = int((total_time - end_hours) * 60)
        end_time_str = f"{end_hours:02d}:{end_minutes:02d}"
        end_time = datetime.strptime(end_time_str, "%H:%M").time()

        # Create fieldwork entry
        fieldwork = FieldWork(
            job_id=job.id,
            work_date=work_date,
            start_time=start_time,
            end_time=end_time,
            total_time=round(total_time, 2),
            crew=data.get("crew", "").strip() or None,
            drone_card=data.get("drone_card", "").strip() or None,
            notes=data.get("notes", "").strip() or None,
        )

        db.session.add(fieldwork)

        # Update job aggregates
        job.visited += 1
        job.total_time_spent += fieldwork.total_time

        db.session.commit()

        return jsonify(
            {
                "message": "Fieldwork added successfully",
                "fieldwork": fieldwork.to_dict(),
            }
        ), 201

    except ValueError as e:
        return jsonify({"error": f"Invalid date/time format: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/fieldwork/<int:fieldwork_id>", methods=["PUT"])
@login_required
def update_fieldwork(fieldwork_id):
    """PUT /api/fieldwork/123 - Update fieldwork entry"""
    fieldwork = FieldWork.query.get(fieldwork_id)
    if not fieldwork:
        return jsonify({"error": "Fieldwork entry not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    try:
        # Store old total time for job aggregate update
        old_total_time = fieldwork.total_time

        # Update fields if provided
        if "work_date" in data:
            fieldwork.work_date = datetime.strptime(
                data["work_date"], "%Y-%m-%d"
            ).date()
        
        # Handle total_time update (new format)
        if "total_time" in data:
            total_time = data["total_time"]
            if isinstance(total_time, str):
                # Try parsing as "HH:MM" format
                if ":" in total_time:
                    parts = total_time.split(":")
                    if len(parts) == 2:
                        hours = int(parts[0])
                        minutes = int(parts[1])
                        if minutes < 0 or minutes >= 60:
                            return jsonify({"error": "Minutes must be between 0 and 59"}), 400
                        total_time = hours + (minutes / 60.0)
                    else:
                        return jsonify({"error": "Invalid time format. Use HH:MM (e.g., 2:30)"}), 400
                else:
                    # Try parsing as float string
                    total_time = float(total_time)
            else:
                total_time = float(total_time)
            
            if total_time <= 0:
                return jsonify({"error": "Total time must be greater than 0"}), 400
            
            fieldwork.total_time = round(total_time, 2)
            
            # Update start_time and end_time for database compatibility
            start_time = datetime.strptime("00:00", "%H:%M").time()
            end_hours = int(total_time)
            end_minutes = int((total_time - end_hours) * 60)
            end_time_str = f"{end_hours:02d}:{end_minutes:02d}"
            fieldwork.start_time = start_time
            fieldwork.end_time = datetime.strptime(end_time_str, "%H:%M").time()
        
        # Legacy support: if start_time/end_time are provided, calculate total_time
        elif "start_time" in data and "end_time" in data:
            fieldwork.start_time = datetime.strptime(data["start_time"], "%H:%M").time()
            fieldwork.end_time = datetime.strptime(data["end_time"], "%H:%M").time()
            
            if fieldwork.start_time >= fieldwork.end_time:
                return jsonify({"error": "End time must be after start time"}), 400

            start_dt = datetime.combine(fieldwork.work_date, fieldwork.start_time)
            end_dt = datetime.combine(fieldwork.work_date, fieldwork.end_time)
            fieldwork.total_time = round((end_dt - start_dt).total_seconds() / 3600, 2)
        
        if "crew" in data:
            fieldwork.crew = data["crew"].strip() or None
        if "drone_card" in data:
            fieldwork.drone_card = data["drone_card"].strip() or None
        if "notes" in data:
            fieldwork.notes = data["notes"].strip() or None

        # Update job aggregate time
        job = fieldwork.job
        time_difference = fieldwork.total_time - old_total_time
        job.total_time_spent += time_difference

        db.session.commit()

        return jsonify(
            {
                "message": "Fieldwork updated successfully",
                "fieldwork": fieldwork.to_dict(),
            }
        )

    except ValueError as e:
        return jsonify({"error": f"Invalid date/time format: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/fieldwork/<int:fieldwork_id>", methods=["DELETE"])
@login_required
def delete_fieldwork(fieldwork_id):
    """DELETE /api/fieldwork/123 - Delete fieldwork entry"""
    fieldwork = FieldWork.query.get(fieldwork_id)
    if not fieldwork:
        return jsonify({"error": "Fieldwork entry not found"}), 404

    try:
        job = fieldwork.job

        # Update job aggregates before deleting
        job.visited = max(0, job.visited - 1)
        job.total_time_spent = max(0, job.total_time_spent - fieldwork.total_time)

        db.session.delete(fieldwork)
        db.session.commit()

        return jsonify({"message": "Fieldwork entry deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500

