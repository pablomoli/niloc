# api_routes.py - New consolidated API endpoints
import os
import re
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import Blueprint, jsonify, request, session
from sqlalchemy import and_, func, or_, text
from sqlalchemy.orm import aliased

from auth_utils import hash_password, login_required
from models import FieldWork, Job, User, Tag, db, job_tags
from utils import get_brevard_property_link, get_county_from_coords, geocode_brevard_parcel
from db_utils import with_db_retry, handle_db_error

# Create API blueprint
api_bp = Blueprint("api", __name__, url_prefix="/api")


def require_admin():
    """Helper to check admin permissions"""
    if session.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


def validate_job_data(data):
    """Centralized job validation - Single source of truth"""
    errors = []

    # Required fields
    if not data.get("job_number", "").strip():
        errors.append("Job number is required")
    if not data.get("client", "").strip():
        errors.append("Client is required")
    # Address is only required for non-parcel jobs
    is_parcel_job = bool(data.get("is_parcel_job"))
    if not is_parcel_job:
        if not data.get("address", "").strip():
            errors.append("Address is required")
    else:
        # For parcel jobs, latitude and longitude are required
        if data.get("latitude") in (None, "") or data.get("longitude") in (None, ""):
            errors.append("Latitude and longitude are required for parcel jobs")

    # Business rules
    job_number = data.get("job_number", "").strip().upper()
    if job_number and len(job_number) < 3:
        errors.append("Job number must be at least 3 characters")

    return errors, job_number


def geocode_address(address):
    """Centralized geocoding logic"""
    api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")
    if not api_key:
        return None

    try:
        geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"address": address + " , Florida", "key": api_key}
        res = requests.get(geo_url, params=params, timeout=10)

        if res.status_code == 200:
            geo_data = res.json()
            if geo_data.get("status") == "OK" and geo_data["results"]:
                result = geo_data["results"][0]
                location = result["geometry"]["location"]

                # Extract county from Google's address components
                county = None
                for component in result.get("address_components", []):
                    if "administrative_area_level_2" in component.get("types", []):
                        county = component.get("long_name", "").replace(" County", "")
                        break

                return {
                    "lat": str(location["lat"]),
                    "lng": str(location["lng"]),
                    "formatted_address": result["formatted_address"],
                    "county": county,
                }
    except Exception as e:
        print(f"Geocoding error: {e}")

    return None


# =============================================================================
# JOB ENDPOINTS - RESTful design
# =============================================================================


@api_bp.route("/jobs", methods=["GET"])
@login_required
@with_db_retry(max_retries=3, delay=0.5)
def get_jobs():
    """
    ENHANCED: GET /api/jobs - Unified endpoint with fuzzy search and pagination

    Query params:
    - q: search term (triggers fuzzy search across all jobs)
    - search: legacy search param (for backward compatibility)
    - job_number, client, status: individual field filters
    - page, per_page: pagination controls
    - include_deleted: include soft-deleted jobs

    Returns: All matching jobs (no pagination when searching) or paginated results
    """
    try:
        # all possible search and filter parameters
        search_term = (
            request.args.get("q", "").strip() or request.args.get("search", "").strip()
        )
        job_number_filter = request.args.get("job_number", "").strip()
        client_filter = request.args.get("client", "").strip()
        status_filter = request.args.get("status", "").strip()
        include_deleted = request.args.get("include_deleted", "false").lower() == "true"

        # Pagination parameters
        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", type=int)
        if per_page is None:
            per_page = 10000

        # Start with base query
        if include_deleted:
            query = Job.query
        else:
            query = Job.active()

        # Check if this is a comprehensive search request
        if search_term:
            # Use fuzzy search logic - search ALL jobs, no pagination
            search_fields = [Job.job_number, Job.client, Job.address]
            # Add parcel_id when we add that field in Sprint 1c
            # search_fields.append(Job.parcel_id)

            search_condition = create_fuzzy_search_conditions(
                search_term, search_fields
            )
            # Extend search to include tag names
            tag_patterns = [
                f"%{search_term.lower()}%",
                f"%{normalize_search_term(search_term)}%",
                f"{search_term.lower()}%",
                f"{normalize_search_term(search_term)}%",
            ]
            tags_condition = or_(
                *[Tag.name.ilike(p) for p in tag_patterns]
            ) if search_term else None

            if search_condition is not None and tags_condition is not None:
                query = (
                    query.outerjoin(job_tags, Job.id == job_tags.c.job_id)
                    .outerjoin(Tag, Tag.id == job_tags.c.tag_id)
                    .filter(or_(search_condition, tags_condition))
                    .distinct()
                )
            elif search_condition is not None:
                query = query.filter(search_condition)
            elif tags_condition is not None:
                query = (
                    query.outerjoin(job_tags, Job.id == job_tags.c.job_id)
                    .outerjoin(Tag, Tag.id == job_tags.c.tag_id)
                    .filter(tags_condition)
                    .distinct()
                )

            # Apply additional filters if provided
            if status_filter:
                query = query.filter(Job.status == status_filter)

            # Order by relevance for search results - SIMPLIFIED
            search_lower = search_term.lower()
            query = query.order_by(
                func.lower(Job.job_number)
                .like(f"{search_lower}%")
                .desc(),  # Job number starts with search
                func.lower(Job.client)
                .like(f"{search_lower}%")
                .desc(),  # Client starts with search
                Job.created_at.desc(),  # Then by newest
            )

            # Execute search query (no pagination for search results)
            jobs = query.all()

            return jsonify(
                {
                    "jobs": [job.to_dict() for job in jobs],
                    "total": len(jobs),
                    "search_term": search_term,
                    "fuzzy_search": True,
                    "status_filter": status_filter,
                    "include_deleted": include_deleted,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )

        else:
            # Use traditional filtering with pagination (backward compatibility)

            # Apply individual field filters
            if job_number_filter:
                # Use fuzzy matching even for individual fields
                fuzzy_condition = create_fuzzy_search_conditions(
                    job_number_filter, [Job.job_number]
                )
                if fuzzy_condition is not None:
                    query = query.filter(fuzzy_condition)
                else:
                    query = query.filter(Job.job_number.ilike(f"%{job_number_filter}%"))

            if client_filter:
                fuzzy_condition = create_fuzzy_search_conditions(
                    client_filter, [Job.client]
                )
                if fuzzy_condition is not None:
                    query = query.filter(fuzzy_condition)
                else:
                    query = query.filter(Job.client.ilike(f"%{client_filter}%"))

            if status_filter:
                query = query.filter(Job.status == status_filter)

            # Standard ordering
            query = query.order_by(Job.created_at.desc())

            # Apply pagination if requested
            if request.args.get("per_page") is not None and per_page < 10000:
                pagination = query.paginate(
                    page=page, per_page=per_page, error_out=False
                )

                return jsonify(
                    {
                        "jobs": [job.to_dict() for job in pagination.items],
                        "total": pagination.total,
                        "pages": pagination.pages,
                        "current_page": page,
                        "per_page": per_page,
                        "has_next": pagination.has_next,
                        "has_prev": pagination.has_prev,
                        "filtered": bool(
                            job_number_filter or client_filter or status_filter
                        ),
                        "fuzzy_matching": True,
                    }
                )
            else:
                # Return all jobs (for map view or large per_page)
                jobs = query.all()
                return jsonify(
                    {
                        "jobs": [job.to_dict() for job in jobs],
                        "total": len(jobs),
                        "filtered": bool(
                            job_number_filter or client_filter or status_filter
                        ),
                        "fuzzy_matching": True,
                    }
                )

    except Exception as e:
        print(f"Jobs endpoint error: {e}")
        return handle_db_error(e)


@api_bp.route("/jobs/<job_number>", methods=["GET"])
@login_required
@with_db_retry(max_retries=3, delay=0.5)
def get_job(job_number):
    """GET /api/jobs/JOB123 - Get specific job"""

    include_deleted = request.args.get("include_deleted", "false").lower() == "true"

    if include_deleted:
        job = Job.find_by_number(job_number, include_deleted=True)
    else:
        job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    return jsonify(job.to_dict())


@api_bp.route("/jobs", methods=["POST"])
@login_required
def create_job():
    """POST /api/jobs - Create new job"""
    # Try to get JSON data first, then fall back to form data
    data = request.get_json()
    if not data:
        data = request.form.to_dict()

    if not data:
        return jsonify({"error": "No data provided"}), 400

    # Validate input
    errors, job_number = validate_job_data(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    # Check for duplicates
    existing = Job.active().filter_by(job_number=job_number).first()
    if existing:
        return jsonify({"error": "Job number already exists"}), 409

    # Handle geocoding based on job type
    is_parcel = bool(data.get("is_parcel_job"))
    address = (data.get("address") or "").strip()
    
    if is_parcel:
        # For parcel jobs, use the coordinates provided from frontend
        parcel_info = data.get("parcel_data", {})
        print(f"Parcel job creation: County={parcel_info.get('county')}, ID={parcel_info.get('parcel_id')}")
        
        # Don't re-geocode parcel jobs - use provided coordinates
        geocode_result = None
        lat = data.get("latitude")
        lng = data.get("longitude")
        county = parcel_info.get("county", "").title() if parcel_info else None
        # Do not store any address for parcel-created jobs
        address = None
    else:
        # For regular address jobs, geocode the address
        geocode_result = geocode_address(address)
        lat = geocode_result["lat"] if geocode_result else None
        lng = geocode_result["lng"] if geocode_result else None
        county = geocode_result["county"] if geocode_result else None

    # Create job object
    job_data = {
        "job_number": job_number,
        "client": data["client"].strip(),
        "address": address,
        "status": data.get("status", "").strip() or None,
        "notes": (data.get("notes") or "").strip() or None,
        "created_at": datetime.now(timezone.utc),
        "created_by_id": session.get("user_id"),
        "visited": 0,
        "total_time_spent": 0.0,
        "is_parcel_job": data.get("is_parcel_job", False),
        "parcel_data": data.get("parcel_data", None),
        "lat": str(lat) if lat else None,
        "long": str(lng) if lng else None,
        "county": county,
    }

    # Add property appraiser link for Brevard County
    if (not is_parcel) and county and county.lower() == "brevard":
        job_data["prop_appr_link"] = get_brevard_property_link(address)

    # Save to database
    try:
        job = Job(**job_data)
        db.session.add(job)
        db.session.commit()

        return jsonify(
            {"message": "Job created successfully", "job": job.to_dict()}
        ), 201

    except Exception as e:
        db.session.rollback()
        print(f"Create job error: {e}")
        print(f"Job data: {job_data}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500


@api_bp.route("/jobs/<job_number>", methods=["PUT"])
@login_required
def update_job(job_number):
    """PUT /api/jobs/JOB123 - Update job"""
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404
    
    # Note: Parcel jobs can be edited, but address is managed by parcel lookup
    # and should not be modified directly via this endpoint.

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Update allowed fields
    updateable_fields = [
        "client",
        "address",
        "status",
        "county",
        "notes",
        "prop_appr_link",
        "plat_link",
        "fema_link",
        "document_url",
    ]
    # For parcel jobs, prevent updating address directly
    if job.is_parcel_job and "address" in updateable_fields:
        updateable_fields.remove("address")

    address_changed = False
    for field in updateable_fields:
        if field in data:
            value = data[field].strip() if isinstance(data[field], str) else data[field]
            if field == "address" and value != job.address:
                address_changed = True
            setattr(job, field, value)

    # Re-geocode if address changed (only for non-parcel jobs)
    if (not job.is_parcel_job) and address_changed and job.address:
        geocode_result = geocode_address(job.address)
        if geocode_result:
            job.lat = geocode_result["lat"]
            job.long = geocode_result["lng"]
            job.address = geocode_result["formatted_address"]
            job.county = geocode_result["county"]

    try:
        db.session.commit()
        return jsonify({"message": "Job updated successfully", "job": job.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


# =============================================================================
# TAGS ENDPOINTS
# =============================================================================


@api_bp.route("/tags", methods=["GET"])
@login_required
def list_tags():
    include_usage = request.args.get("include_usage", "false").lower() == "true"
    tags = Tag.query.order_by(Tag.name.asc()).all()
    if not include_usage:
        return jsonify([t.to_dict() for t in tags])

    # Add job_count for each tag
    counts = dict(
        db.session.query(job_tags.c.tag_id, func.count(job_tags.c.job_id))
        .group_by(job_tags.c.tag_id)
        .all()
    )
    enriched = []
    for t in tags:
        d = t.to_dict()
        d["job_count"] = int(counts.get(t.id, 0))
        enriched.append(d)
    return jsonify(enriched)


@api_bp.route("/tags", methods=["POST"])
@login_required
def create_tag():
    admin_check = require_admin()
    if admin_check:
        return admin_check
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    color = (data.get("color") or "#007bff").strip() or "#007bff"
    if not name:
        return jsonify({"error": "Tag name is required"}), 400
    existing = Tag.query.filter_by(name=name).first()
    if existing:
        return jsonify({"error": "Tag name already exists"}), 409
    try:
        tag = Tag(name=name, color=color, created_at=datetime.now(timezone.utc))
        db.session.add(tag)
        db.session.commit()
        return jsonify(tag.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/tags/<int:tag_id>", methods=["PUT"])
@login_required
def update_tag(tag_id):
    admin_check = require_admin()
    if admin_check:
        return admin_check
    tag = Tag.query.get(tag_id)
    if not tag:
        return jsonify({"error": "Tag not found"}), 404
    data = request.get_json() or {}
    if "name" in data:
        new_name = (data.get("name") or "").strip()
        if not new_name:
            return jsonify({"error": "Tag name cannot be empty"}), 400
        exists = Tag.query.filter(Tag.id != tag_id, Tag.name == new_name).first()
        if exists:
            return jsonify({"error": "Tag name already exists"}), 409
        tag.name = new_name
    if "color" in data:
        color = (data.get("color") or "").strip() or "#007bff"
        tag.color = color
    try:
        db.session.commit()
        return jsonify(tag.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/tags/<int:tag_id>", methods=["DELETE"])
@login_required
def delete_tag(tag_id):
    admin_check = require_admin()
    if admin_check:
        return admin_check
    tag = Tag.query.get(tag_id)
    if not tag:
        return jsonify({"error": "Tag not found"}), 404
    # Do not allow delete if tag is in use
    usage = (
        db.session.query(func.count(job_tags.c.job_id))
        .filter(job_tags.c.tag_id == tag_id)
        .scalar()
    )
    if usage and usage > 0:
        return jsonify({"error": "Tag is in use and cannot be deleted"}), 409

    try:
        db.session.delete(tag)
        db.session.commit()
        return jsonify({"message": "Tag deleted"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


# =============================================================================
# JOB TAGGING ENDPOINTS
# =============================================================================


@api_bp.route("/jobs/<job_number>/tags", methods=["GET"])
@login_required
def get_job_tags(job_number):
    job = Job.find_by_number(job_number, include_deleted=False)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify([t.to_dict() for t in job.tags])


@api_bp.route("/jobs/<job_number>/tags", methods=["POST"])
@login_required
def add_tag_to_job(job_number):
    job = Job.find_by_number(job_number, include_deleted=False)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    data = request.get_json() or {}
    tag_id = data.get("tag_id")
    tag_name = (data.get("name") or "").strip()

    tag = None
    if tag_id:
        tag = Tag.query.get(tag_id)
    elif tag_name:
        tag = Tag.query.filter_by(name=tag_name).first()
        if not tag:
            # Only admin may create-on-the-fly
            if session.get("role") == "admin":
                tag = Tag(
                    name=tag_name,
                    color=(data.get("color") or "#007bff").strip() or "#007bff",
                    created_at=datetime.now(timezone.utc),
                )
                db.session.add(tag)
            else:
                return jsonify({"error": "Tag not found. Ask admin to create it."}), 404
    else:
        return jsonify({"error": "Provide tag_id or name"}), 400

    if not tag:
        return jsonify({"error": "Tag not found"}), 404

    if tag in job.tags:
        return jsonify({"message": "Tag already assigned", "tags": [t.to_dict() for t in job.tags]})

    try:
        job.tags.append(tag)
        db.session.commit()
        return jsonify({"message": "Tag added", "tags": [t.to_dict() for t in job.tags]})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/jobs/<job_number>/tags/<int:tag_id>", methods=["DELETE"])
@login_required
def remove_tag_from_job(job_number, tag_id):
    job = Job.find_by_number(job_number, include_deleted=False)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    tag = Tag.query.get(tag_id)
    if not tag:
        return jsonify({"error": "Tag not found"}), 404
    if tag not in job.tags:
        return jsonify({"message": "Tag not on job", "tags": [t.to_dict() for t in job.tags]})
    try:
        job.tags.remove(tag)
        db.session.commit()
        return jsonify({"message": "Tag removed", "tags": [t.to_dict() for t in job.tags]})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/jobs/<job_number>", methods=["DELETE"])
@login_required
def delete_job(job_number):
    """DELETE /api/jobs/JOB123 - Enhanced soft delete with timestamped job number"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    # Find active job by job number
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    try:
        # Store original number for response
        original_number = job.job_number

        # Perform enhanced soft delete
        job.soft_delete()
        job.deleted_by_id = session.get("user_id")

        db.session.commit()

        return jsonify(
            {
                "message": f"Job {original_number} deleted successfully",
                "original_job_number": original_number,
                "deleted_job_number": job.job_number,
                "deleted_at": job.deleted_at.isoformat(),
            }
        )

    except Exception as e:
        db.session.rollback()
        print(f"Delete job error: {e}")
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/<job_number>/restore", methods=["POST"])
@login_required
def restore_job(job_number):
    """POST /api/jobs/JOB123/restore - Restore deleted job"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    # Find deleted job by either current job_number or original_job_number
    job = (
        Job.query.filter(
            or_(Job.job_number == job_number, Job.original_job_number == job_number)
        )
        .filter(Job.deleted_at.isnot(None))
        .first()
    )

    if not job:
        return jsonify({"error": "Deleted job not found"}), 404

    try:
        # Restore the job (includes validation)
        restored_number = job.restore()

        db.session.commit()

        return jsonify(
            {
                "message": f"Job {restored_number} restored successfully",
                "job_number": restored_number,
                "job": job.to_dict(),
            }
        )

    except ValueError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Restore job error: {e}")
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/<job_number>/promote-to-address", methods=["POST"])
@login_required
def promote_parcel_to_address(job_number: str):
    """POST /api/jobs/JOB123/promote-to-address - Promote parcel job to address job

    Requires JSON body: { "address": "..." }
    - Validates presence of address.
    - Attempts to geocode provided address (if API key configured) to set lat/lng/county.
    - Sets is_parcel_job = False.
    """
    # Find active job by job number
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if not job.is_parcel_job:
        return jsonify({"error": "Job is already an address job"}), 400

    payload = request.get_json(silent=True) or {}
    address = (payload.get("address") or "").strip()
    if not address:
        return jsonify({"error": "Address is required to promote this job"}), 400

    try:
        # Try to geocode to enrich coordinates/county
        geo = geocode_address(address)

        job.address = geo.get("formatted_address") if geo and geo.get("formatted_address") else address
        if geo:
            job.lat = str(geo.get("lat")) if geo.get("lat") is not None else job.lat
            job.long = str(geo.get("lng")) if geo.get("lng") is not None else job.long
            if geo.get("county"):
                job.county = geo.get("county")
        job.is_parcel_job = False

        db.session.commit()

        return jsonify({
            "message": f"Job {job_number} promoted to address job successfully",
            "job": job.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        print(f"Promote job error: {e}")
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/deleted", methods=["GET"])
@login_required
def get_deleted_jobs():
    """GET /api/jobs/deleted - List all deleted jobs"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    try:
        # Get search parameter for filtering deleted jobs
        search_term = request.args.get("q", "").strip()

        # Start with deleted jobs query
        query = Job.deleted().order_by(Job.deleted_at.desc())

        # Apply search filter if provided
        if search_term:
            search_condition = create_fuzzy_search_conditions(
                search_term,
                [Job.job_number, Job.original_job_number, Job.client, Job.address],
            )
            if search_condition is not None:
                query = query.filter(search_condition)

        deleted_jobs = query.all()

        return jsonify(
            {
                "jobs": [job.to_dict() for job in deleted_jobs],
                "total": len(deleted_jobs),
                "search_term": search_term if search_term else None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    except Exception as e:
        print(f"Get deleted jobs error: {e}")
        return jsonify(
            {"error": "Failed to fetch deleted jobs", "jobs": [], "total": 0}
        ), 500


# =============================================================================
# FIELDWORK ENDPOINTS
# =============================================================================


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

    # Validate required fields
    required_fields = ["work_date", "start_time", "end_time"]
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return jsonify(
            {"error": f"Missing required fields: {', '.join(missing_fields)}"}
        ), 400

    try:
        # Parse and validate dates/times
        work_date = datetime.strptime(data["work_date"], "%Y-%m-%d").date()
        start_time = datetime.strptime(data["start_time"], "%H:%M").time()
        end_time = datetime.strptime(data["end_time"], "%H:%M").time()

        if start_time >= end_time:
            return jsonify({"error": "End time must be after start time"}), 400

        # Calculate total time
        start_dt = datetime.combine(work_date, start_time)
        end_dt = datetime.combine(work_date, end_time)
        total_time = (end_dt - start_dt).total_seconds() / 3600

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
        if "start_time" in data:
            fieldwork.start_time = datetime.strptime(data["start_time"], "%H:%M").time()
        if "end_time" in data:
            fieldwork.end_time = datetime.strptime(data["end_time"], "%H:%M").time()
        if "crew" in data:
            fieldwork.crew = data["crew"].strip() or None
        if "drone_card" in data:
            fieldwork.drone_card = data["drone_card"].strip() or None
        if "notes" in data:
            fieldwork.notes = data["notes"].strip() or None

        # Recalculate total time if times changed
        if fieldwork.start_time and fieldwork.end_time:
            if fieldwork.start_time >= fieldwork.end_time:
                return jsonify({"error": "End time must be after start time"}), 400

            start_dt = datetime.combine(fieldwork.work_date, fieldwork.start_time)
            end_dt = datetime.combine(fieldwork.work_date, fieldwork.end_time)
            fieldwork.total_time = round((end_dt - start_dt).total_seconds() / 3600, 2)

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


# =============================================================================
# USER ENDPOINTS - Admin only
# =============================================================================


@api_bp.route("/users", methods=["GET"])
@login_required
def get_users():
    """GET /api/users - List all users (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    # Hide "pablo" user from admin panel
    users = User.query.filter(User.username != "pablo").all()
    return jsonify([user.to_dict() for user in users])


@api_bp.route("/users", methods=["POST"])
@login_required
def create_user():
    """POST /api/users - Create new user (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate required fields
    required_fields = ["username", "name", "password", "role"]
    missing_fields = [
        field for field in required_fields if not data.get(field, "").strip()
    ]
    if missing_fields:
        return jsonify(
            {"error": f"Missing required fields: {', '.join(missing_fields)}"}
        ), 400

    # Validate role
    if data["role"] not in ["admin", "user"]:
        return jsonify({"error": 'Role must be "admin" or "user"'}), 400

    # Check for duplicate username
    existing_user = User.query.filter_by(username=data["username"].strip()).first()
    if existing_user:
        return jsonify({"error": "Username already exists"}), 409

    try:
        user = User(
            username=data["username"].strip(),
            name=data["name"].strip(),
            password=hash_password(data["password"]),
            role=data["role"],
            created_at=datetime.now(timezone.utc),
        )

        db.session.add(user)
        db.session.commit()

        return jsonify(
            {"message": "User created successfully", "user": user.to_dict()}
        ), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>", methods=["PUT"])
@login_required
def update_user(user_id):
    """PUT /api/users/123 - Update user (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate username if provided
    if "username" in data:
        new_username = data["username"].strip()
        if not new_username:
            return jsonify({"error": "Username cannot be empty"}), 400

        # Check for duplicate username (excluding current user)
        existing = User.query.filter(
            User.username == new_username, User.id != user_id
        ).first()
        if existing:
            return jsonify({"error": "Username already exists"}), 409

        user.username = new_username

    # Update name if provided
    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            return jsonify({"error": "Name cannot be empty"}), 400
        user.name = new_name

    # Update password if provided
    if "password" in data and data["password"].strip():
        user.password = hash_password(data["password"])

    # Update role if provided
    if "role" in data:
        if data["role"] not in ["admin", "user"]:
            return jsonify({"error": 'Role must be "admin" or "user"'}), 400
        user.role = data["role"]

    try:
        db.session.commit()
        return jsonify({"message": "User updated successfully", "user": user.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>", methods=["DELETE"])
@login_required
def delete_user(user_id):
    """DELETE /api/users/123 - Delete user (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Multiple protection checks
    if user.username == "pablo":
        return jsonify({"error": "Cannot delete this user"}), 403

    if user.role == "admin":
        return jsonify({"error": "Cannot delete admin users"}), 403

    if user.id == session.get("user_id"):
        return jsonify({"error": "Cannot delete your own account"}), 403

    try:
        username = user.username
        db.session.delete(user)
        db.session.commit()

        return jsonify({"message": f"User {username} deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>/password", methods=["PUT"])
@login_required
def reset_user_password(user_id):
    """PUT /api/users/123/password - Reset user password (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data or not data.get("password", "").strip():
        return jsonify({"error": "Password is required"}), 400

    try:
        user.password = hash_password(data["password"])
        db.session.commit()

        return jsonify({"message": f"Password reset for {user.name}"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>/role", methods=["PUT"])
@login_required
def update_user_role(user_id):
    """PUT /api/users/123/role - Toggle user role (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        # Toggle role
        user.role = "admin" if user.role == "user" else "user"
        db.session.commit()

        return jsonify(
            {
                "message": f"{user.name} role changed to {user.role}",
                "user": user.to_dict(),
            }
        )
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================


@api_bp.route("/geocode", methods=["GET"])
@login_required
def geocode_endpoint():
    """GET /api/geocode?address=123+Main+St - Geocode address"""
    address = request.args.get("address", "").strip()
    if not address:
        return jsonify({"error": "Address parameter required"}), 400

    result = geocode_address(address)
    if not result:
        return jsonify({"error": "Could not geocode address"}), 404

    return jsonify(result)


@api_bp.route("/reverse-geocode", methods=["GET"])
@login_required
def reverse_geocode():
    """Convert latitude/longitude coordinates to a readable address"""
    try:
        lat = request.args.get("lat")
        lng = request.args.get("lng")

        if not lat or not lng:
            return jsonify({"error": "Missing required parameters: lat and lng"}), 400

        lat_float = float(lat)
        lng_float = float(lng)

        # Get Google Maps API key
        api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")
        if not api_key:
            return jsonify({"error": "Geocoding service not configured"}), 500

        # Make request to Google Geocoding API (reverse geocoding)
        geocoding_url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"latlng": f"{lat_float},{lng_float}", "key": api_key}

        response = requests.get(geocoding_url, params=params, timeout=10)
        data = response.json()

        if data["status"] != "OK" or not data.get("results"):
            return jsonify({"error": "No address found"}), 404

        # Get the best result
        best_result = data["results"][0]
        formatted_address = best_result.get("formatted_address", "")

        # Extract county
        county = None
        for component in best_result.get("address_components", []):
            if "administrative_area_level_2" in component.get("types", []):
                county = component.get("long_name", "").replace(" County", "")
                break

        return jsonify(
            {
                "formatted_address": formatted_address,
                "county": county,
                "lat": lat_float,
                "lng": lng_float,
            }
        )

    except Exception as e:
        return jsonify({"error": "Reverse geocoding failed"}), 500


@api_bp.route("/geocode/brevard-parcel", methods=["GET"])
@login_required
def geocode_brevard_parcel_endpoint():
    """
    GET /api/geocode/brevard-parcel - Geocode Brevard County parcel
    Query params: tax_account (required)
    Note: Parcel ID lookup removed due to reliability issues
    """
    tax_account = request.args.get("tax_account", "").strip()

    if not tax_account:
        return jsonify({"error": "tax_account parameter required"}), 400

    result = geocode_brevard_parcel(tax_account=tax_account)

    if not result:
        return jsonify({"error": "Could not geocode parcel"}), 404

    return jsonify(result)


@api_bp.route("/geocode/orange-parcel", methods=["GET"])
@login_required
def geocode_orange_parcel_endpoint():
    """
    GET /api/geocode/orange-parcel - Geocode Orange County parcel
    Query params: parcel_id (must include dashes, e.g., "13-23-32-7600-00-070")
    """
    parcel_id = request.args.get("parcel_id", "").strip()
    
    if not parcel_id:
        return jsonify({"error": "parcel_id parameter required"}), 400
    
    # Validate that parcel ID contains dashes (proper format)
    if '-' not in parcel_id:
        return jsonify({"error": "Invalid parcel_id format. Must include dashes (e.g., 13-23-32-7600-00-070)"}), 400
    
    # Import at point of use to avoid circular imports
    from utils import geocode_orange_parcel
    
    result = geocode_orange_parcel(parcel_id)
    
    if not result:
        return jsonify({"error": "Could not geocode parcel"}), 404
    
    return jsonify(result)


@api_bp.route("/health", methods=["GET"])
def health_check():
    """GET /api/health - System health check"""
    try:
        # Test database connection
        db.session.execute(text("SELECT 1"))

        return jsonify(
            {
                "status": "healthy",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "database": "connected",
                "geocoding": "available"
                if os.getenv("GOOGLE_GEOCODING_API_KEY")
                else "unavailable",
            }
        )
    except Exception as e:
        return jsonify(
            {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ), 503


def normalize_search_term(term):
    """
    Normalize search term for comprehensive fuzzy matching
    Handles: case, spaces, punctuation, common abbreviations
    """
    if not term:
        return ""

    # Convert to lowercase
    normalized = term.lower().strip()

    # Remove common punctuation and replace with spaces
    normalized = re.sub(r"[-_.,/#!$%^&*;:{}=`~()]", " ", normalized)

    # Replace multiple spaces with single space
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # Common abbreviations and variations
    abbreviations = {
        "st": "street",
        "ave": "avenue",
        "rd": "road",
        "dr": "drive",
        "ln": "lane",
        "ct": "court",
        "blvd": "boulevard",
        "n": "north",
        "s": "south",
        "e": "east",
        "w": "west",
        "ne": "northeast",
        "nw": "northwest",
        "se": "southeast",
        "sw": "southwest",
    }

    # Replace abbreviations (as whole words only)
    for abbr, full in abbreviations.items():
        normalized = re.sub(r"\b" + abbr + r"\b", full, normalized)

    return normalized


def create_fuzzy_search_conditions(search_term, fields):
    """
    Create comprehensive fuzzy search conditions
    Returns multiple OR conditions for maximum match capability
    """
    if not search_term or not fields:
        return None

    conditions = []

    # Original term variations
    original = search_term.strip()
    normalized = normalize_search_term(original)
    no_spaces = original.replace(" ", "").lower()

    # Create search patterns
    patterns = [
        f"%{original.lower()}%",  # Exact case-insensitive
        f"%{normalized}%",  # Normalized version
        f"%{no_spaces}%",  # No spaces version
    ]

    # Add individual word patterns for multi-word searches
    words = normalized.split()
    if len(words) > 1:
        for word in words:
            if len(word) > 2:  # Skip very short words
                patterns.append(f"%{word}%")

    # Remove duplicates while preserving order
    unique_patterns = []
    for pattern in patterns:
        if pattern not in unique_patterns:
            unique_patterns.append(pattern)

    # Create conditions for each field and pattern combination
    for field in fields:
        for pattern in unique_patterns:
            # Basic ILIKE search
            conditions.append(field.ilike(pattern))

            # Remove punctuation from field for matching (simplified version)
            try:
                conditions.append(
                    func.regexp_replace(
                        field, r"[-_.,/#!$%^&*;:{}=`~()]", " ", "g"
                    ).ilike(pattern)
                )
            except:
                # If regexp_replace fails, just use basic ilike
                pass

    if conditions:
        return or_(*conditions)
    return None


def monitor_search_performance(f):
    """Decorator to monitor search performance"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        import time  # Import time inside the function

        start_time = time.time()
        result = f(*args, **kwargs)
        end_time = time.time()

        # Log slow searches (> 500ms)
        duration = (end_time - start_time) * 1000
        if duration > 500:
            search_term = request.args.get("q", "")
            print(f"SLOW SEARCH: {duration:.2f}ms for term: '{search_term}'")

        return result

    return decorated_function


@api_bp.route("/jobs/search", methods=["GET"])
@login_required
@monitor_search_performance
def search_jobs():
    """
    GET /api/jobs/search - Real-time fuzzy search across ALL jobs
    Query params: q (search term), status, include_deleted
    Returns all matching jobs without pagination
    """
    try:
        # Get search parameters
        search_term = request.args.get("q", "").strip()
        status_filter = request.args.get("status", "").strip()
        include_deleted = request.args.get("include_deleted", "false").lower() == "true"

        # Start with base query
        if include_deleted:
            query = Job.query  # Include deleted jobs
        else:
            query = Job.active()  # Only active jobs (existing method)

        # Apply comprehensive fuzzy search
        if search_term:
            search_fields = [Job.job_number, Job.client, Job.address]
            # Add parcel_id when we add that field in Sprint 1c
            # search_fields.append(Job.parcel_id)

            search_condition = create_fuzzy_search_conditions(
                search_term, search_fields
            )
            if search_condition is not None:
                query = query.filter(search_condition)

        # Apply status filter if provided
        if status_filter:
            query = query.filter(Job.status == status_filter)

        # Order by relevance, then by newest first
        if search_term:
            # Score results by relevance (exact matches first) - SIMPLIFIED VERSION
            search_lower = search_term.lower()

            # Create ordering that works with your SQLAlchemy version
            query = query.order_by(
                func.lower(Job.job_number)
                .like(f"{search_lower}%")
                .desc(),  # Job number starts with search
                func.lower(Job.client)
                .like(f"{search_lower}%")
                .desc(),  # Client starts with search
                Job.created_at.desc(),  # Then by newest
            )
        else:
            query = query.order_by(Job.created_at.desc())

        # Execute query and get all results (no pagination)
        jobs = query.all()

        # Return results with metadata
        return jsonify(
            {
                "jobs": [job.to_dict() for job in jobs],
                "total": len(jobs),
                "search_term": search_term,
                "status_filter": status_filter,
                "include_deleted": include_deleted,
                "fuzzy_matching": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"error": "Search failed", "jobs": [], "total": 0}), 500


@api_bp.route("/jobs/search/autocomplete", methods=["GET"])
@login_required
@monitor_search_performance
def search_autocomplete():
    """
    GET /api/jobs/search/autocomplete - Get intelligent search suggestions
    Query params: q (partial search term), limit (default 10)
    Returns suggestions for job numbers, clients, and addresses with fuzzy matching
    """
    try:
        search_term = request.args.get("q", "").strip()
        limit = min(int(request.args.get("limit", 10)), 50)  # Cap at 50 results

        if len(search_term) < 2:  # Don't search for very short terms
            return jsonify({"suggestions": []})

        # Prefer fast prefix search for autocomplete
        prefix = f"{search_term}%"

        suggestions = []

        # Jobs: job_number prefix
        try:
            job_numbers = (
                db.session.query(Job.job_number)
                .filter(Job.deleted_at.is_(None), Job.job_number.ilike(prefix))
                .distinct()
                .limit(max(1, limit // 3))
                .all()
            )
            for (job_number,) in job_numbers:
                if not any(s["value"] == job_number for s in suggestions):
                    suggestions.append(
                        {
                            "value": job_number,
                            "type": "job_number",
                            "label": f"Job: {job_number}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            print(f"Job number autocomplete error: {e}")

        # Jobs: client prefix
        try:
            clients = (
                db.session.query(Job.client)
                .filter(Job.deleted_at.is_(None), Job.client.ilike(prefix))
                .distinct()
                .limit(max(1, limit // 3))
                .all()
            )
            for (client,) in clients:
                if client and not any(s["value"] == client for s in suggestions):
                    suggestions.append(
                        {
                            "value": client,
                            "type": "client",
                            "label": f"Client: {client}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            print(f"Client autocomplete error: {e}")

        # Jobs: address prefix
        try:
            addresses = (
                db.session.query(Job.address)
                .filter(Job.deleted_at.is_(None), Job.address.ilike(prefix))
                .distinct()
                .limit(max(1, limit // 3))
                .all()
            )
            for (address,) in addresses:
                if address and not any(s["value"] == address for s in suggestions):
                    display_address = address[:50] + "..." if len(address) > 50 else address
                    suggestions.append(
                        {
                            "value": address,
                            "type": "address",
                            "label": f"Address: {display_address}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            print(f"Address autocomplete error: {e}")

        # Tags: prefix
        try:
            tag_names = (
                db.session.query(Tag.name)
                .filter(Tag.name.ilike(prefix))
                .distinct()
                .limit(max(1, limit // 4))
                .all()
            )
            for (tag_name,) in tag_names:
                if tag_name and not any(
                    s["value"] == tag_name and s["type"] == "tag" for s in suggestions
                ):
                    suggestions.append(
                        {
                            "value": tag_name,
                            "type": "tag",
                            "label": f"Tag: {tag_name}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            print(f"Tag autocomplete error: {e}")

        # Sort by type (job_number, client, address, tag), then alphabetically
        type_order = {"job_number": 0, "client": 1, "address": 2, "tag": 3}
        suggestions.sort(key=lambda x: (type_order.get(x["type"], 99), x["value"].lower()))

        return jsonify(
            {
                "suggestions": suggestions[:limit],
                "search_term": search_term,
                "fuzzy_matching": True,
            }
        )

    except Exception as e:
        print(f"Autocomplete error: {e}")
        return jsonify({"suggestions": []})


@api_bp.route("/jobs/<job_number>/permanent-delete", methods=["DELETE"])
@login_required
def permanent_delete_job(job_number):
    """Permanently delete a job and all related data"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    # Find deleted job only
    job = Job.deleted().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Deleted job not found"}), 404

    try:
        # Delete related fieldwork first
        FieldWork.query.filter_by(job_id=job.id).delete()

        # Delete the job permanently
        db.session.delete(job)
        db.session.commit()

        return jsonify({"message": "Job permanently deleted"})

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500
