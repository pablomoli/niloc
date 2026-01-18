# Generated from api_routes.py split
import logging
import time
from datetime import datetime, timezone, date

from flask import jsonify, request, session, g
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload, joinedload

from api import api_bp, require_admin, validate_job_data, geocode_address
from api.search import create_fuzzy_search_conditions, normalize_search_term
from auth_utils import login_required
from models import db, Job, Tag, FieldWork, User, job_tags
from db_utils import with_db_retry, handle_db_error
from utils import get_brevard_property_link, is_valid_job_status, VALID_JOB_STATUSES

logger = logging.getLogger(__name__)

# Constants for pagination and limits
DEFAULT_PER_PAGE = 1000  # Default to 1000 - reasonable for datasets with ~1000 entries
MAX_PER_PAGE = 2000
MAX_SEARCH_RESULTS = 500  # Limit search results to prevent huge responses
MAX_BULK_OPERATION_SIZE = 500  # Maximum jobs per bulk update/delete operation


def _extract_parcel_geometry(parcel_data):
    """
    Extract parcel boundary geometry from parcel_data if available.
    The geometry is stored in parcel_data.raw_response.geometry from the geocoding API.
    """
    if not parcel_data:
        return None
    try:
        raw_response = parcel_data.get("raw_response", {})
        geometry = raw_response.get("geometry")
        if geometry and geometry.get("rings"):
            return geometry
    except (AttributeError, TypeError):
        pass
    return None


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
    - page, per_page: pagination controls (default 1000, max 2000)
    - include_deleted: include soft-deleted jobs

    Returns: Paginated results with eager-loaded relationships
    """
    query_start_time = time.time()
    try:
        # all possible search and filter parameters
        search_term = (
            request.args.get("q", "").strip() or request.args.get("search", "").strip()
        )
        job_number_filter = request.args.get("job_number", "").strip()
        client_filter = request.args.get("client", "").strip()
        status_filter = request.args.get("status", "").strip()
        include_deleted = request.args.get("include_deleted", "false").lower() == "true"

        # Pagination parameters with defaults and limits
        page = max(1, request.args.get("page", 1, type=int))
        per_page = request.args.get("per_page", type=int)
        if per_page is None:
            per_page = DEFAULT_PER_PAGE
        else:
            per_page = min(max(1, per_page), MAX_PER_PAGE)  # Enforce limits

        # Start with base query with eager loading to prevent N+1 queries
        # Use joinedload for better performance when loading tags (single query with JOIN)
        # Check if tags are needed (can be skipped for map views that don't display tags)
        include_tags = request.args.get("include_tags", "true").lower() == "true"
        if include_deleted:
            query = (
                Job.query.options(joinedload(Job.tags)) if include_tags else Job.query
            )
        else:
            query = (
                Job.active().options(joinedload(Job.tags))
                if include_tags
                else Job.active()
            )

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
            tags_condition = (
                or_(*[Tag.name.ilike(p) for p in tag_patterns]) if search_term else None
            )

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

            # Execute search query with result limit
            jobs = query.limit(MAX_SEARCH_RESULTS).all()

            # Log slow queries
            query_duration = (time.time() - query_start_time) * 1000
            if query_duration > 100:
                logger.warning(
                    f"SLOW QUERY: get_jobs(search) {query_duration:.0f}ms '{search_term[:30]}'"
                )

            # Optimize serialization - batch process jobs
            jobs_list = []
            for job in jobs:
                jobs_list.append(job.to_dict())

            return jsonify(
                {
                    "jobs": jobs_list,
                    "total": len(jobs_list),
                    "search_term": search_term,
                    "fuzzy_search": True,
                    "status_filter": status_filter,
                    "include_deleted": include_deleted,
                    "limit_applied": len(jobs_list) >= MAX_SEARCH_RESULTS,
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

            # Always use pagination (enforced limit)
            pagination = query.paginate(page=page, per_page=per_page, error_out=False)

            # Log slow queries
            query_duration = (time.time() - query_start_time) * 1000
            if query_duration > 100:
                logger.warning(f"SLOW QUERY: get_jobs {query_duration:.0f}ms")

            # Optimize serialization - batch process jobs
            jobs_list = []
            for job in pagination.items:
                jobs_list.append(job.to_dict())

            return jsonify(
                {
                    "jobs": jobs_list,
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

    except Exception as e:
        logger.error(f"Jobs endpoint error: {e}", exc_info=True)
        return handle_db_error(e)


@api_bp.route("/jobs/due-dates", methods=["GET"])
@login_required
@with_db_retry(max_retries=3, delay=0.5)
def get_due_date_counts():
    """
    GET /api/jobs/due-dates?month=YYYY-MM - Get due date counts for a month.

    Returns per-day counts of active jobs with due dates in the requested month.
    Response: { "month": "YYYY-MM", "counts": { "YYYY-MM-DD": int, ... } }
    """
    try:
        month_param = request.args.get("month", "").strip()

        if not month_param:
            # Default to current month
            today = date.today()
            month_param = today.strftime("%Y-%m")

        # Parse month parameter
        try:
            year, month = map(int, month_param.split("-"))
            first_day = date(year, month, 1)
            # Calculate last day of month
            if month == 12:
                last_day = date(year + 1, 1, 1)
            else:
                last_day = date(year, month + 1, 1)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid month format. Use YYYY-MM"}), 400

        # Query active jobs with due_date in the month range
        # Use string comparison to avoid timezone issues with date columns
        first_day_str = first_day.isoformat()
        last_day_str = last_day.isoformat()

        counts = (
            db.session.query(
                func.cast(Job.due_date, db.String),
                func.count(Job.id)
            )
            .filter(Job.deleted_at.is_(None))
            .filter(Job.due_date.isnot(None))
            .filter(func.cast(Job.due_date, db.String) >= first_day_str)
            .filter(func.cast(Job.due_date, db.String) < last_day_str)
            .group_by(func.cast(Job.due_date, db.String))
            .all()
        )

        # Build counts dictionary
        counts_dict = {}
        for due_date_str, count in counts:
            if due_date_str:
                counts_dict[due_date_str] = count

        return jsonify({
            "month": month_param,
            "counts": counts_dict
        })

    except Exception as e:
        logger.error(f"Due dates endpoint error: {e}", exc_info=True)
        return handle_db_error(e)


@api_bp.route("/jobs/<job_number>", methods=["GET"])
@login_required
@with_db_retry(max_retries=3, delay=0.5)
def get_job(job_number):
    """GET /api/jobs/JOB123 - Get specific job with eager-loaded relationships"""
    query_start_time = time.time()

    include_deleted = request.args.get("include_deleted", "false").lower() == "true"

    if include_deleted:
        job = (
            Job.query.options(joinedload(Job.tags))
            .filter(Job.job_number == job_number)
            .first()
        )
    else:
        job = (
            Job.active()
            .options(joinedload(Job.tags))
            .filter_by(job_number=job_number)
            .first()
        )

    if not job:
        return jsonify({"error": "Job not found"}), 404

    # Log slow queries
    query_duration = (time.time() - query_start_time) * 1000
    if query_duration > 100:
        logger.warning(f"SLOW QUERY: get_job {query_duration:.0f}ms")

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
        logger.info(
            f"Parcel job creation: County={parcel_info.get('county')}, ID={parcel_info.get('parcel_id')}"
        )

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

    # Validate status if provided
    status = data.get("status", "").strip() or None
    if status and not is_valid_job_status(status):
        return jsonify(
            {
                "error": f"Invalid status: {status}. Must be one of: {', '.join(VALID_JOB_STATUSES)}"
            }
        ), 400

    due_date_raw = (data.get("due_date") or "").strip()
    due_date = None
    if due_date_raw:
        try:
            due_date = date.fromisoformat(due_date_raw)
        except ValueError:
            return jsonify({"error": f"Invalid due_date format: {due_date_raw}. Expected YYYY-MM-DD"}), 400

    # Create job object
    job_data = {
        "job_number": job_number,
        "client": data["client"].strip(),
        "address": address,
        "status": status,
        "notes": (data.get("notes") or "").strip() or None,
        "created_at": datetime.now(timezone.utc),
        "due_date": due_date,
        "created_by_id": session.get("user_id"),
        "visited": 0,
        "total_time_spent": 0.0,
        "is_parcel_job": data.get("is_parcel_job", False),
        "parcel_data": data.get("parcel_data", None),
        "parcel_geometry": _extract_parcel_geometry(data.get("parcel_data")),
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
        logger.error(f"Create job error: {e}", exc_info=True)
        logger.debug(f"Job data: {job_data}")
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
        "due_date",
    ]
    # For parcel jobs, prevent updating address directly
    if job.is_parcel_job and "address" in updateable_fields:
        updateable_fields.remove("address")

    address_changed = False
    for field in updateable_fields:
        if field in data:
            if field == "due_date":
                raw_value = data[field].strip() if isinstance(data[field], str) else data[field]
                value = None
                if raw_value:
                    try:
                        value = date.fromisoformat(raw_value)
                    except ValueError:
                        return jsonify({"error": f"Invalid due_date format: {raw_value}. Expected YYYY-MM-DD"}), 400
            else:
                value = data[field].strip() if isinstance(data[field], str) else data[field]
            # Validate status if being updated
            if field == "status" and value and not is_valid_job_status(value):
                return jsonify(
                    {
                        "error": f"Invalid status: {value}. Must be one of: {', '.join(VALID_JOB_STATUSES)}"
                    }
                ), 400
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
        logger.error(f"Delete job error: {e}", exc_info=True)
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
        logger.error(f"Restore job error: {e}", exc_info=True)
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

        job.address = (
            geo.get("formatted_address")
            if geo and geo.get("formatted_address")
            else address
        )
        if geo:
            job.lat = str(geo.get("lat")) if geo.get("lat") is not None else job.lat
            job.long = str(geo.get("lng")) if geo.get("lng") is not None else job.long
            if geo.get("county"):
                job.county = geo.get("county")
        job.is_parcel_job = False

        db.session.commit()

        return jsonify(
            {
                "message": f"Job {job_number} promoted to address job successfully",
                "job": job.to_dict(),
            }
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Promote job error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/<job_number>/parcel-geometry", methods=["GET"])
@login_required
def get_parcel_geometry(job_number):
    """
    GET /api/jobs/<job_number>/parcel-geometry - Fetch and cache parcel boundary geometry.

    For parcel jobs: Re-fetches geometry using stored parcel_id/tax_account.
    For address jobs: Queries parcel layer by coordinates to find containing parcel.

    Returns cached geometry if available, otherwise fetches and caches it.
    Use ?refresh=true to force re-fetch even if cached.
    """
    from utils import geocode_orange_parcel, geocode_brevard_parcel

    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    refresh = request.args.get("refresh", "").lower() == "true"

    # Return cached geometry if available and not forcing refresh
    if job.parcel_geometry and not refresh:
        return jsonify({
            "job_number": job_number,
            "geometry": job.parcel_geometry,
            "cached": True
        })

    geometry = None
    county = (job.county or "").lower()

    logger.info(f"Fetching parcel geometry for job {job_number}: is_parcel_job={job.is_parcel_job}, county={county}, lat={job.lat}, lng={job.long}")

    try:
        if job.is_parcel_job and job.parcel_data:
            # For parcel jobs, use the stored parcel_id/tax_account
            parcel_data = job.parcel_data
            if county == "orange" and parcel_data.get("parcel_id"):
                result = geocode_orange_parcel(parcel_data["parcel_id"])
                if result and result.get("geometry"):
                    geometry = result["geometry"]
            elif county == "brevard" and parcel_data.get("tax_account"):
                result = geocode_brevard_parcel(parcel_data["tax_account"])
                if result and result.get("geometry"):
                    geometry = result["geometry"]
        else:
            # For address jobs, try address-based lookup first, then fall back to coordinates
            # Orange County: try address lookup first (reliable)
            # Brevard County: use coordinate lookup directly (address field doesn't match)
            if county == "orange" and job.address:
                logger.info(f"Querying parcel by address for job: address={job.address}, county={county}")
                geometry = _query_parcel_by_address(job.address, county)

            # Coordinate query for Brevard or as fallback for Orange
            if not geometry and job.lat and job.long:
                lat = float(job.lat)
                lng = float(job.long)
                logger.info(f"Querying parcel by coordinates: lat={lat}, lng={lng}, county={county}")
                geometry = _query_parcel_by_coordinates(lat, lng, county)

            if not geometry:
                logger.warning(f"Job {job_number} - no parcel found by address or coordinates")

        if geometry:
            # Cache the geometry
            job.parcel_geometry = geometry
            db.session.commit()
            return jsonify({
                "job_number": job_number,
                "geometry": geometry,
                "cached": False
            })
        else:
            return jsonify({"error": "Could not fetch parcel geometry"}), 404

    except Exception as e:
        db.session.rollback()
        logger.error(f"Parcel geometry fetch error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch parcel geometry"}), 500


def _query_parcel_by_address(address, county):
    """
    Query parcel layer by address to find the matching parcel.
    Uses ArcGIS query with SITUS/address field.
    """
    import requests

    if not address:
        return None

    # Clean address for query - extract just the street address part
    # Remove city, state, zip if present
    address_parts = address.split(',')
    street_address = address_parts[0].strip().upper()

    logger.info(f"Querying parcel by address: '{street_address}' in {county}")

    if county == "orange":
        url = "https://ocgis4.ocfl.net/arcgis/rest/services/Public_Dynamic/MapServer/216/query"
        # Query SITUS field which contains the address
        params = {
            "where": f"SITUS LIKE '%{street_address}%'",
            "outFields": "PARCEL,SITUS",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json"
        }
    elif county == "brevard":
        url = "https://www.bcpao.us/arcgis/rest/services/Brevard_Detailed_Dynamic/MapServer/24/query"
        params = {
            "where": f"Address LIKE '%{street_address}%'",
            "outFields": "TaxAcct,Address",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json"
        }
    else:
        logger.warning(f"Unsupported county for address query: {county}")
        return None

    try:
        logger.info(f"Making address query to: {url}")
        # Brevard blocks python-requests User-Agent
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        feature_count = len(data.get("features", []))
        logger.info(f"Address query returned {feature_count} features")

        if data.get("features") and len(data["features"]) > 0:
            feature = data["features"][0]
            geometry = feature.get("geometry")
            if geometry and geometry.get("rings"):
                logger.info(f"Found parcel geometry by address with {len(geometry['rings'])} rings")
                return {"type": "polygon", "rings": geometry["rings"]}
            else:
                logger.warning(f"Feature found but no geometry rings")
        else:
            logger.warning(f"No features found for address '{street_address}'")
    except Exception as e:
        logger.error(f"Parcel address query error: {e}", exc_info=True)

    return None


def _query_parcel_by_coordinates(lat, lng, county):
    """
    Query parcel layer by coordinates to find the containing parcel.
    Uses ArcGIS spatial query with point geometry.
    """
    import requests

    logger.info(f"Querying parcel by coordinates: lat={lat}, lng={lng}, county={county}")

    if county == "orange":
        url = "https://ocgis4.ocfl.net/arcgis/rest/services/Public_Dynamic/MapServer/216/query"
        params = {
            "geometry": f"{lng},{lat}",
            "geometryType": "esriGeometryPoint",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "PARCEL,SITUS",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json"
        }
    elif county == "brevard":
        url = "https://www.bcpao.us/arcgis/rest/services/Brevard_Detailed_Dynamic/MapServer/24/query"
        params = {
            "geometry": f"{lng},{lat}",
            "geometryType": "esriGeometryPoint",
            "spatialRel": "esriSpatialRelIntersects",
            "inSR": "4326",
            "outFields": "TaxAcct,Name",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json"
        }
    else:
        logger.warning(f"Unsupported county for parcel query: {county}")
        return None

    try:
        # Timeout increased to 30s as Orange County endpoint can be slow
        # Brevard blocks python-requests User-Agent
        logger.info(f"Making spatial query to: {url}")
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        feature_count = len(data.get("features", []))
        logger.info(f"Spatial query returned {feature_count} features")

        if data.get("features") and len(data["features"]) > 0:
            feature = data["features"][0]
            geometry = feature.get("geometry")
            if geometry and geometry.get("rings"):
                logger.info(f"Found parcel geometry with {len(geometry['rings'])} rings")
                return {"type": "polygon", "rings": geometry["rings"]}
            else:
                logger.warning(f"Feature found but no geometry rings: {feature.keys()}")
        else:
            logger.warning(f"No features found at coordinates ({lat}, {lng})")
    except Exception as e:
        logger.error(f"Parcel spatial query error: {e}", exc_info=True)

    return None


@api_bp.route("/jobs/bulk-update-status", methods=["POST"])
@login_required
def bulk_update_status():
    """POST /api/jobs/bulk-update-status - Update status for multiple jobs

    Body: { "job_numbers": [...], "status": "..." }
    Returns: 200 for complete success, 207 for partial success
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    job_numbers = data.get("job_numbers", [])
    new_status = data.get("status", "").strip()

    # Validation
    if not isinstance(job_numbers, list) or len(job_numbers) == 0:
        return jsonify({"error": "job_numbers array required"}), 400

    if not new_status:
        return jsonify({"error": "status is required"}), 400

    # Validate status value
    if not is_valid_job_status(new_status):
        return jsonify(
            {
                "error": f"Invalid status: {new_status}. Must be one of: {', '.join(VALID_JOB_STATUSES)}"
            }
        ), 400

    # Limit bulk operations to reasonable size
    if len(job_numbers) > MAX_BULK_OPERATION_SIZE:
        return jsonify(
            {"error": f"Maximum {MAX_BULK_OPERATION_SIZE} jobs per bulk update"}
        ), 400

    # Track results
    successes = []
    failures = []

    try:
        # Process each job
        for job_number in job_numbers:
            job = Job.active().filter_by(job_number=job_number).first()

            if not job:
                failures.append({"job_number": job_number, "error": "Job not found"})
                continue

            # Update status
            job.status = new_status
            successes.append(job_number)

        # Commit all changes in one transaction
        db.session.commit()

        # Build response
        total = len(job_numbers)
        updated = len(successes)
        failed = len(failures)

        if failed == 0:
            # Complete success
            return jsonify(
                {
                    "message": f"{updated} job{'s' if updated != 1 else ''} updated successfully",
                    "updated": updated,
                    "total": total,
                    "job_numbers": successes,
                    "status": new_status,
                }
            ), 200
        else:
            # Partial success
            return jsonify(
                {
                    "message": f"{updated} of {total} jobs updated",
                    "updated": updated,
                    "total": total,
                    "failed": failed,
                    "status": new_status,
                    "successes": successes,
                    "failures": failures,
                }
            ), 207  # Multi-Status

    except Exception as e:
        db.session.rollback()
        logger.error(f"Bulk update error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/bulk-delete", methods=["POST"])
@login_required
def bulk_delete_jobs():
    """POST /api/jobs/bulk-delete - Soft delete multiple jobs (admin only)

    Body: { "job_numbers": [...] }
    Returns: 200 for complete success, 207 for partial success
    """
    # Check admin permission
    admin_check = require_admin()
    if admin_check:
        return admin_check

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    job_numbers = data.get("job_numbers", [])

    # Validation
    if not isinstance(job_numbers, list) or len(job_numbers) == 0:
        return jsonify({"error": "job_numbers array required"}), 400

    # Limit bulk operations
    if len(job_numbers) > MAX_BULK_OPERATION_SIZE:
        return jsonify(
            {"error": f"Maximum {MAX_BULK_OPERATION_SIZE} jobs per bulk delete"}
        ), 400

    # Track results
    successes = []
    failures = []

    try:
        user_id = session.get("user_id")

        # Process each job
        for job_number in job_numbers:
            job = Job.active().filter_by(job_number=job_number).first()

            if not job:
                failures.append({"job_number": job_number, "error": "Job not found"})
                continue

            # Perform soft delete
            job.soft_delete()
            job.deleted_by_id = user_id
            successes.append(job_number)

        # Commit all changes in one transaction
        db.session.commit()

        # Build response
        total = len(job_numbers)
        deleted = len(successes)
        failed = len(failures)

        if failed == 0:
            # Complete success
            return jsonify(
                {
                    "message": f"{deleted} job{'s' if deleted != 1 else ''} deleted successfully",
                    "deleted": deleted,
                    "total": total,
                    "job_numbers": successes,
                }
            ), 200
        else:
            # Partial success
            return jsonify(
                {
                    "message": f"{deleted} of {total} jobs deleted",
                    "deleted": deleted,
                    "total": total,
                    "failed": failed,
                    "successes": successes,
                    "failures": failures,
                }
            ), 207  # Multi-Status

    except Exception as e:
        db.session.rollback()
        logger.error(f"Bulk delete error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/deleted", methods=["GET"])
@login_required
def get_deleted_jobs():
    """GET /api/jobs/deleted - List all deleted jobs"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    query_start_time = time.time()
    try:
        # Get search parameter for filtering deleted jobs
        search_term = request.args.get("q", "").strip()

        # Start with deleted jobs query with eager loading
        query = (
            Job.deleted().options(joinedload(Job.tags)).order_by(Job.deleted_at.desc())
        )

        # Apply search filter if provided
        if search_term:
            search_condition = create_fuzzy_search_conditions(
                search_term,
                [Job.job_number, Job.original_job_number, Job.client, Job.address],
            )
            if search_condition is not None:
                query = query.filter(search_condition)

        # Limit results to prevent huge responses
        deleted_jobs = query.limit(MAX_SEARCH_RESULTS).all()

        # Log slow queries
        query_duration = (time.time() - query_start_time) * 1000
        if query_duration > 100:
            logger.warning(f"SLOW QUERY: get_deleted_jobs {query_duration:.0f}ms")

        return jsonify(
            {
                "jobs": [job.to_dict() for job in deleted_jobs],
                "total": len(deleted_jobs),
                "search_term": search_term if search_term else None,
                "limit_applied": len(deleted_jobs) >= MAX_SEARCH_RESULTS,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"Get deleted jobs error: {e}", exc_info=True)
        return jsonify(
            {"error": "Failed to fetch deleted jobs", "jobs": [], "total": 0}
        ), 500


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


@api_bp.route("/jobs/<job_number>/links", methods=["POST"])
@login_required
def add_job_link(job_number):
    """POST /api/jobs/JOB123/links - Add a link to job

    Body: { "url": "https://...", "display_name": "..." }
    """
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    url = (data.get("url") or "").strip()
    display_name = (data.get("display_name") or "").strip()

    if not url:
        return jsonify({"error": "URL is required"}), 400
    if not display_name:
        return jsonify({"error": "Display name is required"}), 400

    # Validate URL format (basic check)
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "URL must start with http:// or https://"}), 400

    try:
        # Initialize links array if None
        current_links = job.links or []

        # Add new link
        new_link = {"url": url, "display_name": display_name}
        current_links.append(new_link)
        job.links = current_links

        db.session.commit()

        return jsonify({
            "message": "Link added successfully",
            "link": new_link,
            "links": job.links
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Add link error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/<job_number>/links/<int:index>", methods=["DELETE"])
@login_required
def remove_job_link(job_number, index):
    """DELETE /api/jobs/JOB123/links/0 - Remove a link by index"""
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    current_links = list(job.links or [])

    if index < 0 or index >= len(current_links):
        return jsonify({"error": "Link index out of range"}), 404

    try:
        # Remove link at index
        removed_link = current_links.pop(index)
        job.links = current_links

        db.session.commit()

        return jsonify({
            "message": "Link removed successfully",
            "removed_link": removed_link,
            "links": job.links
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Remove link error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500
