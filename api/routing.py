# api/routing.py - Driving route endpoints
import os
import logging

import requests
from flask import jsonify, request

from api import api_bp
from auth_utils import login_required

logger = logging.getLogger(__name__)
_missing_api_key_warned = False


@api_bp.route("/route", methods=["POST"])
@login_required
def get_driving_route():
    """
    Retrieve a driving route from OpenRouteService for a sequence of coordinates.
    
    Expects a JSON request body containing "coordinates": a list of [lng, lat] pairs (longitude, latitude) with at least two points. Proxies the request to OpenRouteService and returns the routing result.
    
    Returns:
    	GeoJSON (dict): On success, the ORS directions GeoJSON containing route geometry and summary (distance, duration).
    On error:
    	400: Missing or insufficient coordinates.
    	503: Routing service not configured (missing API key) — response includes `"fallback": True`.
    	429: Rate limit exceeded — response includes `"fallback": True`.
    	504: Upstream request timed out — response includes `"fallback": True`.
    	500/other: Upstream or internal error; response contains an `"error"` message and `"fallback": True`.
    """
    data = request.get_json()
    if not data or not data.get("coordinates"):
        return jsonify({"error": "Coordinates array required"}), 400

    coordinates = data.get("coordinates")
    if len(coordinates) < 2:
        return jsonify({"error": "At least 2 coordinates required"}), 400

    # Get OpenRouteService API key
    api_key = os.getenv("OPENROUTE_API_KEY")
    if not api_key:
        global _missing_api_key_warned
        if not _missing_api_key_warned:
            logger.warning("OPENROUTE_API_KEY is not configured; routing disabled")
            _missing_api_key_warned = True
        return jsonify({"error": "Routing service not configured", "fallback": True}), 503

    try:
        # Call OpenRouteService Directions API
        ors_url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
        headers = {
            "Authorization": api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "coordinates": coordinates
        }

        response = requests.post(ors_url, json=payload, headers=headers, timeout=15)

        if response.status_code == 200:
            return jsonify(response.json())
        elif response.status_code == 429:
            logger.warning("OpenRouteService rate limit exceeded")
            return jsonify({"error": "Rate limit exceeded", "fallback": True}), 429
        else:
            error_msg = response.json().get("error", {}).get("message", "Unknown error")
            logger.error(f"OpenRouteService error: {response.status_code} - {error_msg}")
            return jsonify({"error": error_msg, "fallback": True}), response.status_code

    except requests.exceptions.Timeout:
        logger.error("OpenRouteService request timed out")
        return jsonify({"error": "Request timed out", "fallback": True}), 504
    except Exception:
        logger.exception("Route calculation error")
        return jsonify({"error": "Internal server error", "fallback": True}), 500
