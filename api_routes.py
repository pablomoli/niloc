# api_routes.py - New consolidated API endpoints
from flask import Blueprint, request, jsonify, session
from datetime import datetime, timezone
import os
import requests
from models import db, Job, FieldWork, User
from auth_utils import login_required, hash_password
from utils import get_county_from_coords, get_brevard_property_link
import re
from sqlalchemy import text, or_, case, func
from functools import wraps

# Create API blueprint
api_bp = Blueprint("api", __name__, url_prefix="/api")

# =============================================================================
# HELPER FUNCTIONS - These make our code DRY (Don't Repeat Yourself)
# =============================================================================


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
    if not data.get("address", "").strip():
        errors.append("Address is required")

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
        params = {"address": address, "key": api_key}
        res = requests.get(geo_url, params=params, timeout=10)

        if res.status_code == 200:
            geo_data = res.json()
            if geo_data.get("status") == "OK" and geo_data["results"]:
                result = geo_data["results"][0]
                location = result["geometry"]["location"]
                return {
                    "lat": str(location["lat"]),
                    "lng": str(location["lng"]),
                    "formatted_address": result["formatted_address"],
                    "county": get_county_from_coords(location["lat"], location["lng"]),
                }
    except Exception as e:
        print(f"Geocoding error: {e}")

    return None


# =============================================================================
# JOB ENDPOINTS - RESTful design
# =============================================================================


@api_bp.route("/jobs", methods=["GET"])
@login_required
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
        # Get all possible search and filter parameters
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
            per_page = 10000  # Default to large number for backward compatibility

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
            if search_condition is not None:
                query = query.filter(search_condition)

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
        return jsonify({"error": "Failed to fetch jobs", "jobs": [], "total": 0}), 500


@api_bp.route("/jobs/<job_number>", methods=["GET"])
@login_required
def get_job(job_number):
    """GET /api/jobs/JOB123 - Get specific job"""
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    return jsonify(job.to_dict())


@api_bp.route("/jobs", methods=["POST"])
@login_required
def create_job():
    """POST /api/jobs - Create new job"""
    data = request.form.to_dict()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate input
    errors, job_number = validate_job_data(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    # Check for duplicates
    existing = Job.active().filter_by(job_number=job_number).first()
    if existing:
        return jsonify({"error": "Job number already exists"}), 409

    # Geocode address
    address = data["address"].strip()
    geocode_result = geocode_address(address)

    # Create job object
    job_data = {
        "job_number": job_number,
        "client": data["client"].strip(),
        "address": geocode_result["formatted_address"] if geocode_result else address,
        "status": data.get("status", "").strip() or None,
        "created_at": datetime.now(timezone.utc),
        "created_by_id": session.get("user_id"),
        "visited": 0,
        "total_time_spent": 0.0,
        "tags": [],
    }

    # Add geocoded data if successful
    if geocode_result:
        job_data.update(
            {
                "lat": geocode_result["lat"],
                "long": geocode_result["lng"],
                "county": geocode_result["county"],
                "prop_appr_link": get_brevard_property_link(
                    geocode_result["formatted_address"]
                ),
            }
        )

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
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/jobs/<job_number>", methods=["PUT"])
@login_required
def update_job(job_number):
    """PUT /api/jobs/JOB123 - Update job"""
    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

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

    address_changed = False
    for field in updateable_fields:
        if field in data:
            value = data[field].strip() if isinstance(data[field], str) else data[field]
            if field == "address" and value != job.address:
                address_changed = True
            setattr(job, field, value)

    # Re-geocode if address changed
    if address_changed and job.address:
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
    """DELETE /api/jobs/JOB123 - Soft delete job"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    job = Job.active().filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    try:
        # Soft delete - set deleted timestamp instead of removing
        job.deleted_at = datetime.now(timezone.utc)
        job.deleted_by_id = session.get("user_id")
        db.session.commit()

        return jsonify({"message": f"Job {job_number} deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


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

    users = User.query.all()
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

    # Prevent deleting admin user
    if user.username == "admin":
        return jsonify({"error": "Cannot delete admin user"}), 403

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

        # Create fuzzy search patterns
        normalized = normalize_search_term(search_term)
        patterns = [
            f"%{search_term.lower()}%",
            f"%{normalized}%",
            f"{search_term.lower()}%",  # Starts with
            f"{normalized}%",  # Normalized starts with
        ]

        suggestions = []

        # Search job numbers with fuzzy matching - SIMPLIFIED
        for pattern in patterns[:2]:  # Use first 2 patterns for job numbers
            try:
                job_numbers = (
                    db.session.query(Job.job_number)
                    .filter(Job.deleted_at.is_(None), Job.job_number.ilike(pattern))
                    .distinct()
                    .limit(limit // 3)
                    .all()
                )

                for (job_number,) in job_numbers:
                    if not any(s["value"] == job_number for s in suggestions):
                        suggestions.append(
                            {
                                "value": job_number,
                                "type": "job_number",
                                "label": f"Job: {job_number}",
                                "priority": 1
                                if job_number.lower().startswith(search_term.lower())
                                else 2,
                            }
                        )
            except Exception as e:
                print(f"Job number autocomplete error: {e}")

        # Search clients with fuzzy matching - SIMPLIFIED
        for pattern in patterns:
            try:
                clients = (
                    db.session.query(Job.client)
                    .filter(Job.deleted_at.is_(None), Job.client.ilike(pattern))
                    .distinct()
                    .limit(limit // 3)
                    .all()
                )

                for (client,) in clients:
                    if not any(s["value"] == client for s in suggestions):
                        suggestions.append(
                            {
                                "value": client,
                                "type": "client",
                                "label": f"Client: {client}",
                                "priority": 1
                                if client.lower().startswith(search_term.lower())
                                else 2,
                            }
                        )
            except Exception as e:
                print(f"Client autocomplete error: {e}")

        # Search addresses with fuzzy matching - SIMPLIFIED
        for pattern in patterns:
            try:
                addresses = (
                    db.session.query(Job.address)
                    .filter(Job.deleted_at.is_(None), Job.address.ilike(pattern))
                    .distinct()
                    .limit(limit // 3)
                    .all()
                )

                for (address,) in addresses:
                    if not any(s["value"] == address for s in suggestions):
                        # Truncate long addresses
                        display_address = (
                            address[:50] + "..." if len(address) > 50 else address
                        )
                        suggestions.append(
                            {
                                "value": address,
                                "type": "address",
                                "label": f"Address: {display_address}",
                                "priority": 1
                                if address.lower().startswith(search_term.lower())
                                else 2,
                            }
                        )
            except Exception as e:
                print(f"Address autocomplete error: {e}")

        # Sort by priority (exact matches first), then by type, then alphabetically
        suggestions.sort(
            key=lambda x: (
                x["priority"],
                0 if x["type"] == "job_number" else 1 if x["type"] == "client" else 2,
                x["value"].lower(),
            )
        )

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
