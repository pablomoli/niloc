# Generated from api_routes.py split
import os
import logging
import requests
from datetime import datetime, timezone

from flask import jsonify, request
from sqlalchemy import text

from api import api_bp, geocode_address
from auth_utils import login_required
from models import db
from utils import geocode_brevard_parcel, geocode_orange_parcel

logger = logging.getLogger(__name__)

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
