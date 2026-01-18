# Generated from api_routes.py split
import logging
import re
from datetime import datetime, timezone, timedelta

from flask import jsonify, request, session
from sqlalchemy import func, or_

from api import api_bp, require_admin, validate_job_data, geocode_address
from auth_utils import login_required
from models import db, Job, Tag, FieldWork, User, job_tags
from db_utils import with_db_retry, handle_db_error
from utils import get_brevard_property_link

logger = logging.getLogger(__name__)


def parse_time_input(time_str):
    """
    Parse time input in various formats and return total hours as a float.

    Supported formats:
    - Duration: "1:30" (1 hour 30 min), "2:00" (2 hours)
    - Time range 24hr: "10:37-11:37", "14:00-15:30"
    - Time range 12hr: "10:37am-11:37am", "11:30 AM - 1:00 PM"

    Returns:
        float: Total hours, or None if parsing fails
        str: Error message if parsing fails, or None on success
    """
    if not time_str or not isinstance(time_str, str):
        return None, "Time input is required"

    time_str = time_str.strip()

    # Check if it's a time range (contains "-" but not at the start for negative numbers)
    # Need to be careful: "1:30" has no dash, "10:30-11:30" has a dash between times
    # Supports am/pm or shorter a/p format
    range_match = re.match(
        r'^(\d{1,2}:\d{2})\s*(a|am|p|pm)?\s*-\s*(\d{1,2}:\d{2})\s*(a|am|p|pm)?$',
        time_str,
        re.IGNORECASE
    )

    if range_match:
        start_time_str = range_match.group(1)
        start_ampm = range_match.group(2)
        end_time_str = range_match.group(3)
        end_ampm = range_match.group(4)

        start_minutes = _parse_time_to_minutes(start_time_str, start_ampm)
        end_minutes = _parse_time_to_minutes(end_time_str, end_ampm)

        if start_minutes is None or end_minutes is None:
            return None, "Invalid time format in range"

        # Calculate duration
        if end_minutes > start_minutes:
            duration_minutes = end_minutes - start_minutes
        elif end_minutes < start_minutes:
            # Crossed midnight
            duration_minutes = (24 * 60 - start_minutes) + end_minutes
        else:
            return None, "Start and end times are the same"

        return duration_minutes / 60.0, None

    # Try parsing as simple duration "H:MM"
    duration_match = re.match(r'^(\d{1,3}):(\d{2})$', time_str)
    if duration_match:
        hours = int(duration_match.group(1))
        minutes = int(duration_match.group(2))
        if minutes < 0 or minutes >= 60:
            return None, "Minutes must be between 0 and 59"
        return hours + (minutes / 60.0), None

    # Try parsing as plain float
    try:
        return float(time_str), None
    except ValueError:
        return None, "Invalid time format. Use H:MM (e.g., 2:30) or time range (e.g., 10:30-11:45)"


def _parse_time_to_minutes(time_str, ampm=None):
    """
    Parse a time string like "10:37" to minutes since midnight.
    Handles optional AM/PM suffix (supports "a", "am", "p", "pm").

    Returns:
        int: Minutes since midnight, or None if parsing fails
    """
    try:
        parts = time_str.split(":")
        if len(parts) != 2:
            return None

        hours = int(parts[0])
        minutes = int(parts[1])

        if minutes < 0 or minutes >= 60:
            return None

        # Handle 12-hour format (a/am/p/pm)
        if ampm:
            ampm = ampm.lower()
            if hours < 1 or hours > 12:
                return None
            if ampm in ("pm", "p") and hours != 12:
                hours += 12
            elif ampm in ("am", "a") and hours == 12:
                hours = 0
        else:
            # 24-hour format or ambiguous
            # If hour > 12, definitely 24-hour
            # If hour <= 12, assume as-is (could be AM or 24hr)
            if hours < 0 or hours > 23:
                return None

        return hours * 60 + minutes
    except (ValueError, AttributeError):
        return None

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

        # Parse total_time - supports duration (H:MM) or time range (HH:MM-HH:MM)
        total_time, error = parse_time_input(data["total_time"])
        if error:
            return jsonify({"error": error}), 400

        if total_time <= 0:
            return jsonify({"error": "Total time must be greater than 0"}), 400

        # Create fieldwork entry
        fieldwork = FieldWork(
            job_id=job.id,
            work_date=work_date,
            total_time=round(total_time, 2),
            crew=(data.get("crew") or "").strip() or None,
            drone_card=(data.get("drone_card") or "").strip() or None,
            notes=(data.get("notes") or "").strip() or None,
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
        logger.error(f"Fieldwork creation error: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {str(e)}"}), 500


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
        
        # Handle total_time update - supports duration (H:MM) or time range (HH:MM-HH:MM)
        if "total_time" in data:
            total_time, error = parse_time_input(data["total_time"])
            if error:
                return jsonify({"error": error}), 400

            if total_time <= 0:
                return jsonify({"error": "Total time must be greater than 0"}), 400

            fieldwork.total_time = round(total_time, 2)
        
        if "crew" in data:
            fieldwork.crew = (data["crew"] or "").strip() or None
        if "drone_card" in data:
            fieldwork.drone_card = (data["drone_card"] or "").strip() or None
        if "notes" in data:
            fieldwork.notes = (data["notes"] or "").strip() or None

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


@api_bp.route("/fieldwork/batch", methods=["POST"])
@login_required
def batch_create_fieldwork():
    """
    POST /api/fieldwork/batch - Create multiple fieldwork entries at once.
    Body: {
        entries: [
            { job_number: required, work_date: required, total_time: required, crew: optional, notes: optional },
            ...
        ]
    }
    """
    data = request.get_json()
    if not data or not data.get("entries"):
        return jsonify({"error": "entries array required"}), 400

    entries = data["entries"]
    if not isinstance(entries, list) or len(entries) == 0:
        return jsonify({"error": "entries must be a non-empty array"}), 400

    results = []
    errors = []

    for i, entry in enumerate(entries):
        job_number = entry.get("job_number")
        if not job_number:
            errors.append({"index": i, "error": "job_number required"})
            continue

        job = Job.active().filter_by(job_number=job_number).first()
        if not job:
            errors.append({"index": i, "error": f"Job {job_number} not found"})
            continue

        if not entry.get("work_date"):
            errors.append({"index": i, "error": "work_date required"})
            continue

        if not entry.get("total_time"):
            errors.append({"index": i, "error": "total_time required"})
            continue

        try:
            work_date = datetime.strptime(entry["work_date"], "%Y-%m-%d").date()

            total_time, error = parse_time_input(entry["total_time"])
            if error:
                errors.append({"index": i, "error": error})
                continue

            if total_time <= 0:
                errors.append({"index": i, "error": "total_time must be positive"})
                continue

            fieldwork = FieldWork(
                job_id=job.id,
                work_date=work_date,
                total_time=round(total_time, 2),
                crew=(entry.get("crew") or "").strip() or None,
                drone_card=(entry.get("drone_card") or "").strip() or None,
                notes=(entry.get("notes") or "").strip() or None,
            )

            db.session.add(fieldwork)

            # Update job aggregates
            job.visited += 1
            job.total_time_spent += fieldwork.total_time

            results.append({
                "index": i,
                "job_number": job_number,
                "fieldwork": fieldwork.to_dict()
            })

        except ValueError as e:
            errors.append({"index": i, "error": f"Invalid date format: {e}"})
            continue
        except Exception as e:
            errors.append({"index": i, "error": str(e)})
            continue

    if results:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f"Batch fieldwork commit error: {e}", exc_info=True)
            return jsonify({"error": "Database error during commit"}), 500

    return jsonify({
        "message": f"Created {len(results)} fieldwork entries",
        "created": results,
        "errors": errors
    }), 201 if results else 400

