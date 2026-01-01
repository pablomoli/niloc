# api/__init__.py - API Blueprint and shared utilities
from flask import Blueprint, jsonify, session
from datetime import date
import os
import logging
import requests

from auth_utils import login_required
from models import db
from datetime import date

# Create API blueprint
api_bp = Blueprint("api", __name__, url_prefix="/api")

# Configure logger
logger = logging.getLogger(__name__)


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

    due_date_raw = (data.get("due_date") or "").strip()
    if due_date_raw:
        try:
            date.fromisoformat(due_date_raw)
        except ValueError:
            errors.append("Due date must be in YYYY-MM-DD format")

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
        logger.error(f"Geocoding error: {e}", exc_info=True)

    return None


# Import all route modules to register them with the blueprint
# Note: Import order matters - search must be imported before jobs since jobs uses search utilities
from api import search  # Must be first - provides utilities used by jobs
from api import jobs, tags, fieldwork, users, geocoding, routing, pois
