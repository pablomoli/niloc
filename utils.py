import os
import pandas as pd
import requests
import logging
from sqlalchemy import text
from flask import current_app as app
from models import db

logger = logging.getLogger(__name__)

# =============================================================================
# JOB STATUS CONSTANTS - Single source of truth for status values
# =============================================================================

# Valid job status values (stored in database)
VALID_JOB_STATUSES = [
    "On Hold/Pending Estimate",
    "Cancelled/Declined",
    "Needs Fieldwork",
    "Fieldwork Complete",
    "To Be Printed",
    "Set/Flag Pins",
    "Survey Complete/Invoice Sent",
    "Completed/To be Filed",
    "Site Plan",
]

# Status display names (shorter versions for UI)
STATUS_DISPLAY_NAMES = {
    "On Hold/Pending Estimate": "On Hold/Pending Estimate",
    "Cancelled/Declined": "Cancelled/Declined",
    "Needs Fieldwork": "Needs Fieldwork",
    "Fieldwork Complete": "Fieldwork Complete",
    "To Be Printed": "To Be Printed",
    "Set/Flag Pins": "Set/Flag Pins",
    "Survey Complete/Invoice Sent": "Survey Complete/Invoice Sent",
    "Completed/To be Filed": "Completed/To be Filed",
    "Site Plan": "Site Plan",
}

# Mapping from old status names to new status names (for migration)
STATUS_MIGRATION_MAP = {
    "Completed": "Completed/To be Filed",
    "Needs Office Work": "Fieldwork Complete",
    "Invoice Sent": "Survey Complete/Invoice Sent",
    "Set Pins": "Set/Flag Pins",
    "On Hold": "On Hold/Pending Estimate",
    "Ongoing Site": "Site Plan",
    "To Be Printed": "To Be Printed",  # No change
    "Needs Fieldwork": "Needs Fieldwork",  # No change
}

def is_valid_job_status(status):
    """
    Validate that a status value is in the allowed list.
    
    Args:
        status: Status string to validate (can be None)
    
    Returns:
        bool: True if status is valid or None, False otherwise
    """
    if status is None:
        return True  # None/null is allowed
    return status in VALID_JOB_STATUSES

def get_status_display_name(status):
    """
    Get the display name for a status.
    
    Args:
        status: Status string
    
    Returns:
        str: Display name or original status if not found
    """
    return STATUS_DISPLAY_NAMES.get(status, status)

# Load CSV data once when module loads
_brevard_parcels_df = None

def _load_brevard_parcels():
    """Load Brevard parcels CSV data once and cache it"""
    global _brevard_parcels_df
    if _brevard_parcels_df is None:
        try:
            csv_path = os.path.join(os.path.dirname(__file__), 'static', 'data', 'brevard_parcels.csv')
            _brevard_parcels_df = pd.read_csv(csv_path)
            # Convert TaxAcct to integer for exact matching
            _brevard_parcels_df['TaxAcct'] = pd.to_numeric(_brevard_parcels_df['TaxAcct'], errors='coerce')
        except Exception as e:
            logger.error(f"Error loading Brevard parcels CSV: {e}", exc_info=True)
            _brevard_parcels_df = pd.DataFrame()  # Empty dataframe as fallback
    return _brevard_parcels_df

def get_county_from_coords(lat, lon):
    sql = text("""
        SELECT name FROM counties
        WHERE ST_Contains(
            geometry,
            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
        )
        LIMIT 1;
    """)
    with db.engine.connect() as conn:
        result = conn.execute(sql, {"lon": lon, "lat": lat}).fetchone()
        return result[0] if result else None

def get_brevard_property_link(address=None, lat=None, lng=None):
    """
    Get Brevard County Property Appraiser link.

    Args:
        address: Street address to search by
        lat: Latitude for coordinate-based lookup (fallback)
        lng: Longitude for coordinate-based lookup (fallback)

    Returns:
        Property appraiser URL or None
    """
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    account = None

    # Try address lookup first
    if address:
        try:
            url = "https://www.bcpao.us/api/records"
            res = requests.get(url, params={"address": address}, headers=headers, timeout=10)
            res.raise_for_status()
            data = res.json()
            if data:
                account = data[0].get('account')
        except (requests.exceptions.RequestException, KeyError, IndexError, ValueError) as e:
            logger.debug(f"Could not get Brevard property link by address {address}: {e}")

    # Fall back to coordinate lookup if address failed
    if not account and lat and lng:
        try:
            url = "https://www.bcpao.us/arcgis/rest/services/Brevard_Detailed_Dynamic/MapServer/24/query"
            params = {
                "geometry": f"{lng},{lat}",
                "geometryType": "esriGeometryPoint",
                "spatialRel": "esriSpatialRelIntersects",
                "inSR": "4326",
                "outFields": "TaxAcct",
                "returnGeometry": "false",
                "f": "json"
            }
            res = requests.get(url, params=params, headers=headers, timeout=10)
            res.raise_for_status()
            data = res.json()
            if data.get("features") and len(data["features"]) > 0:
                account = data["features"][0].get("attributes", {}).get("TaxAcct")
        except (requests.exceptions.RequestException, KeyError, IndexError, ValueError) as e:
            logger.debug(f"Could not get Brevard property link by coordinates ({lat}, {lng}): {e}")

    if account:
        return f"https://www.bcpao.us/propertysearch/#/account/{account}"

    return None


def get_orange_property_link(parcel_id=None, address=None):
    """
    Get Orange County Property Appraiser link.

    Args:
        parcel_id: Parcel ID in dashed format (e.g., "13-23-32-7600-00-070")
        address: Street address to search by if parcel_id not available

    Returns:
        Property appraiser URL or None
    """
    api_parcel_id = None

    # If we have a parcel_id, convert it to API format
    if parcel_id and '-' in parcel_id:
        parts = parcel_id.split('-')
        if len(parts) == 6:
            # Rearrange: Range + Township + Section + Subdivision + Block + Lot
            api_parcel_id = parts[2] + parts[1] + parts[0] + parts[3] + parts[4] + parts[5]

    # If no parcel_id, try to find it by address
    if not api_parcel_id and address:
        try:
            # Extract street address part
            address_parts = address.split(',')
            street_address = address_parts[0].strip().upper()

            url = "https://ocgis4.ocfl.net/arcgis/rest/services/Public_Dynamic/MapServer/216/query"
            params = {
                "where": f"SITUS LIKE '%{street_address}%'",
                "outFields": "PARCEL",
                "returnGeometry": "false",
                "f": "json"
            }
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            if data.get("features") and len(data["features"]) > 0:
                api_parcel_id = data["features"][0].get("attributes", {}).get("PARCEL")
        except (requests.exceptions.RequestException, KeyError, IndexError, ValueError) as e:
            logger.debug(f"Could not get Orange parcel ID for address {address}: {e}")

    if api_parcel_id:
        return f"https://ocpaweb.ocpafl.org/parcelsearch/Parcel%20ID/{api_parcel_id}"

    return None

def _compute_polygon_centroid(rings):
    """
    Compute the centroid of a polygon from its rings.
    Uses the signed area formula for accurate polygon centroid calculation.

    Args:
        rings: List of rings, where each ring is a list of [lng, lat] coordinates

    Returns:
        Tuple of (latitude, longitude) or None if invalid
    """
    if not rings or not rings[0]:
        return None

    # Use the outer ring (first ring) for centroid calculation
    ring = rings[0]
    if len(ring) < 3:
        return None

    # Signed area formula for polygon centroid
    signed_area = 0.0
    cx = 0.0
    cy = 0.0

    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]      # lng, lat
        x1, y1 = ring[i + 1][0], ring[i + 1][1]

        cross = (x0 * y1) - (x1 * y0)
        signed_area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross

    signed_area *= 0.5

    if abs(signed_area) < 1e-10:
        # Fallback to simple average for degenerate polygons
        lngs = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        return (sum(lats) / len(lats), sum(lngs) / len(lngs))

    cx /= (6.0 * signed_area)
    cy /= (6.0 * signed_area)

    return (cy, cx)  # Return as (lat, lng)


def geocode_brevard_parcel(tax_account: str):
    """
    Geocode a Brevard County parcel by tax account using BCPAO ArcGIS API.
    Returns coordinates, parcel information, and boundary geometry.
    """
    if not tax_account:
        return None

    try:
        tax_account_int = int(tax_account)
    except (ValueError, TypeError):
        return None

    try:
        # Query BCPAO ArcGIS REST API
        url = "https://www.bcpao.us/arcgis/rest/services/Brevard_Detailed_Dynamic/MapServer/24/query"
        params = {
            'where': f"TaxAcct={tax_account_int}",
            'outFields': 'TaxAcct,Name,Acres',
            'returnGeometry': 'true',
            'outSR': '4326',  # WGS84 for Leaflet compatibility
            'f': 'json'
        }

        # Brevard blocks python-requests User-Agent
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()

        if not data.get('features') or len(data['features']) == 0:
            logger.info(f"No results found for Brevard parcel: {tax_account}")
            return None

        # Extract data from first feature
        feature = data['features'][0]
        attributes = feature.get('attributes', {})
        geometry = feature.get('geometry', {})

        tax_acct = attributes.get('TaxAcct')
        parcel_name = attributes.get('Name', '')
        acres = attributes.get('Acres', 0)

        # Compute centroid from geometry
        rings = geometry.get('rings', [])
        centroid = _compute_polygon_centroid(rings)

        if not centroid:
            logger.warning(f"Could not compute centroid for Brevard parcel: {tax_account}")
            return None

        lat, lng = centroid

        # Build notes string
        notes = f"Brevard Parcel - Tax Account: {tax_acct} | Parcel: {parcel_name} | Acres: {acres:.2f}"

        result = {
            "lat": str(lat),
            "lng": str(lng),
            "formatted_address": "No Address Available",
            "county": "Brevard",
            "parcel_id": parcel_name,
            "tax_account": str(tax_acct),
            "acres": float(acres) if acres else 0.0,
            "notes": notes
        }

        # Include parcel boundary geometry
        if rings:
            result['geometry'] = {
                'type': 'polygon',
                'rings': rings
            }

        return result

    except requests.exceptions.RequestException as e:
        logger.error(f"Brevard parcel API request error: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Brevard parcel lookup error: {e}", exc_info=True)
        return None

def geocode_orange_parcel(parcel_id):
    """
    Geocode an Orange County parcel by parcel ID using their ArcGIS REST API.
    
    Args:
        parcel_id: Parcel ID in format "13-23-32-7600-00-070" (with dashes)
    
    Returns:
        Dictionary with lat, lng, and parcel info, or None if not found
    """
    if not parcel_id or '-' not in parcel_id:
        return None
    
    try:
        # Strip dashes and rearrange parcel ID for API
        # From: 13-23-32-7600-00-070 
        # To: 322313760000070
        parts = parcel_id.split('-')
        if len(parts) != 6:
            logger.warning(f"Invalid Orange County parcel ID format: {parcel_id}")
            return None
        
        # Rearrange: parts[2] + parts[1] + parts[0] + parts[3] + parts[4] + parts[5]
        api_parcel_id = parts[2] + parts[1] + parts[0] + parts[3] + parts[4] + parts[5]
        
        # Query Orange County GIS (ocfl.net) ArcGIS REST API
        # Note: vgispublic.ocpafl.org is unreliable, using ocgis4.ocfl.net instead
        # Timeout increased to 30s as this endpoint can be slow
        url = "https://ocgis4.ocfl.net/arcgis/rest/services/Public_Dynamic/MapServer/216/query"
        params = {
            'where': f"PARCEL='{api_parcel_id}'",
            'outFields': 'PARCEL,LATITUDE,LONGITUDE,SITUS',
            'returnGeometry': 'true',
            'outSR': '4326',  # WGS84 for Leaflet compatibility
            'f': 'json'
        }

        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if not data.get('features') or len(data['features']) == 0:
            logger.info(f"No results found for Orange County parcel: {parcel_id}")
            return None

        # Extract coordinates from first feature
        feature = data['features'][0]
        attributes = feature.get('attributes', {})
        geometry = feature.get('geometry', {})

        latitude = attributes.get('LATITUDE')
        longitude = attributes.get('LONGITUDE')
        situs = attributes.get('SITUS', 'No Address Available')

        if latitude is None or longitude is None:
            logger.warning(f"Missing coordinates for Orange County parcel: {parcel_id}")
            return None

        # Build response with geometry if available
        result = {
            "lat": str(latitude),
            "lng": str(longitude),
            "formatted_address": situs if situs != 'No Address Available' else "No Address Available",
            "county": "Orange",
            "parcel_id": parcel_id,  # Keep original format with dashes
            "notes": f"Orange County Parcel - Parcel ID: {parcel_id}"
        }

        # Include parcel boundary geometry if available
        if geometry and geometry.get('rings'):
            result['geometry'] = {
                'type': 'polygon',
                'rings': geometry['rings']
            }

        return result
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Orange County API request error: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Orange County parcel lookup error: {e}", exc_info=True)
        return None
