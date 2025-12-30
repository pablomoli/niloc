# api/pois.py - POI (Point of Interest) endpoints
import logging
import re
from datetime import datetime, timezone

from flask import jsonify, request

from api import api_bp, require_admin
from auth_utils import login_required
from models import POI, db

logger = logging.getLogger(__name__)

# Regex pattern for valid Bootstrap Icon names (prevents XSS via class injection)
ICON_PATTERN = re.compile(r"^bi-[a-z0-9-]+$", re.IGNORECASE)



def validate_icon(icon_value):
    """
    Validate and normalize a Bootstrap Icon name to prevent XSS via class attribute injection.

    Parameters:
        icon_value (str | None): The icon name to validate.

    Returns:
        str | None: The validated icon name, or "bi-geo-alt" if empty, or None if invalid.
    """
    if not icon_value:
        return "bi-geo-alt"
    icon = icon_value.strip()
    if not ICON_PATTERN.match(icon):
        return None  # Invalid
    return icon


@api_bp.route("/pois", methods=["GET"])
def get_pois():
    """GET /api/pois - List all POIs (public, no auth required)"""
    try:
        pois = POI.query.order_by(POI.name.asc()).all()
        return jsonify([poi.to_dict() for poi in pois])
    except Exception as e:
        logger.error(f"Get POIs error: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch POIs"}), 500


@api_bp.route("/pois", methods=["POST"])
@login_required
def create_poi():
    """
    Create a new point of interest (requires admin role).
    
    Validates request JSON for required fields (name, lat, lng), applies defaults for optional fields (address, icon, color), sets the creation timestamp in UTC, persists the POI to the database, and returns the created resource on success.
    
    Returns:
        A Flask response:
          - 201: JSON with message and the created POI object on success.
          - 400: JSON error for missing JSON or invalid/missing required fields.
          - 403: JSON error when the caller lacks admin privileges.
          - 500: JSON error when a database error occurs.
    """
    admin_check = require_admin()
    if admin_check:
        return admin_check

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate required fields
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400

    lat = data.get("lat")
    lng = data.get("lng")
    if lat is None or lng is None:
        return jsonify({"error": "Latitude and longitude are required"}), 400

    try:
        lat = float(lat)
        lng = float(lng)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid latitude or longitude"}), 400

    # Validate icon name
    icon = validate_icon(data.get("icon"))
    if icon is None:
        return jsonify({"error": "Invalid icon name"}), 400

    try:
        poi = POI(
            name=name,
            address=(data.get("address") or "").strip() or None,
            lat=lat,
            lng=lng,
            icon=icon,
            color=(data.get("color") or "#3b82f6").strip(),
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(poi)
        db.session.commit()

        return jsonify({"message": "POI created successfully", "poi": poi.to_dict()}), 201

    except Exception:
        db.session.rollback()
        logger.exception("Create POI error")
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/pois/<int:poi_id>", methods=["GET"])
def get_poi(poi_id):
    """
    Retrieve a point-of-interest by its primary key.
    
    Parameters:
    	poi_id (int): The POI database primary key.
    
    Returns:
    	Flask Response: JSON containing the POI as a dictionary on success; JSON with `{"error": "POI not found"}` and a 404 status if no matching POI exists.
    """
    poi = POI.query.get(poi_id)
    if not poi:
        return jsonify({"error": "POI not found"}), 404
    return jsonify(poi.to_dict())


@api_bp.route("/pois/<int:poi_id>", methods=["PUT"])
@login_required
def update_poi(poi_id):
    """
    Update an existing Point of Interest (POI) by ID; requires admin privileges.
    
    Updates any of the POI fields provided in the JSON body: `name`, `address`, `lat`, `lng`, `icon`, and `color`. Validates that `name` (when provided) is not empty and that `lat`/`lng` (when provided) are numeric.
    
    Parameters:
        poi_id (int): Primary key of the POI to update.
    
    Returns:
        Flask response: On success, JSON with a success message and the updated POI dictionary.
        Possible error responses:
          - 400: Missing JSON body, empty `name`, or invalid `lat`/`lng`.
          - 403: Admin access required.
          - 404: POI not found.
          - 500: Database error occurred during commit.
    """
    admin_check = require_admin()
    if admin_check:
        return admin_check

    poi = POI.query.get(poi_id)
    if not poi:
        return jsonify({"error": "POI not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Update fields if provided
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400
        poi.name = name

    if "address" in data:
        poi.address = (data["address"] or "").strip() or None

    if "lat" in data:
        try:
            poi.lat = float(data["lat"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid latitude"}), 400

    if "lng" in data:
        try:
            poi.lng = float(data["lng"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid longitude"}), 400

    if "icon" in data:
        icon = validate_icon(data["icon"])
        if icon is None:
            return jsonify({"error": "Invalid icon name"}), 400
        poi.icon = icon

    if "color" in data:
        poi.color = (data["color"] or "#3b82f6").strip()

    try:
        db.session.commit()
        return jsonify({"message": "POI updated successfully", "poi": poi.to_dict()})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Update POI error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/pois/<int:poi_id>", methods=["DELETE"])
@login_required
def delete_poi(poi_id):
    """
    Delete a point of interest identified by its ID; operation requires admin privileges.
    
    Returns:
        Flask Response: JSON object with a `message` confirming deletion on success.
        Returns a 404 JSON error if the POI is not found, a 403 JSON error if the caller lacks admin privileges, or a 500 JSON error if a database error occurs.
    """
    admin_check = require_admin()
    if admin_check:
        return admin_check

    poi = POI.query.get(poi_id)
    if not poi:
        return jsonify({"error": "POI not found"}), 404

    try:
        name = poi.name
        db.session.delete(poi)
        db.session.commit()
        return jsonify({"message": f"POI '{name}' deleted successfully"})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Delete POI error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500