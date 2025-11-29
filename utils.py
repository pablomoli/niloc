import os
import pandas as pd
import requests
import logging
from sqlalchemy import text
from flask import current_app as app
from models import db
from pyproj import Transformer

logger = logging.getLogger(__name__)

# =============================================================================
# JOB STATUS CONSTANTS - Single source of truth for status values
# =============================================================================

# Valid job status values (stored in database)
VALID_JOB_STATUSES = [
    "On Hold/Pending Estimate",
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

def get_brevard_property_link(address):
    try:
        url = "https://www.bcpao.us/api/records"
        res = requests.get(url, params={"address": address}, timeout=10)
        res.raise_for_status()
        data = res.json()
        if data:
            return f"https://www.bcpao.us/propertysearch/#/account/{data[0]['account']}"
    except (requests.exceptions.RequestException, KeyError, IndexError, ValueError) as e:
        logger.debug(f"Could not get Brevard property link for address {address}: {e}")
    return None

def geocode_brevard_parcel(tax_account: str):
    """
    Geocode a Brevard County parcel by tax account using CSV lookup.
    Returns coordinates and parcel information from local CSV file.
    """
    if not tax_account:
        return None
    
    try:
        # Load CSV data
        df = _load_brevard_parcels()
        if df.empty:
            return None
        
        # Search for the parcel
        # Convert tax_account to integer for exact matching
        try:
            tax_account_int = int(tax_account)
            matches = df[df['TaxAcct'] == tax_account_int]
        except (ValueError, TypeError):
            return None
        
        if matches.empty:
            return None
        
        # Get first match if multiple results exist
        result = matches.iloc[0]
        
        # Extract data from CSV
        lat = result['latitude']
        lng = result['longitude']
        acres = result['Acres']
        tax_acct = result['TaxAcct']
        parcel_name = result['Name']
        
        # Build notes string
        notes = f"Brevard Parcel - Tax Account: {tax_acct} | Parcel: {parcel_name} | Acres: {acres:.2f}"
        
        return {
            "lat": str(lat),
            "lng": str(lng),
            "formatted_address": "No Address Available",
            "county": "Brevard",
            "parcel_id": parcel_name,
            "tax_account": str(tax_acct),
            "acres": float(acres),
            "notes": notes
        }
        
    except Exception as e:
        logger.error(f"Brevard parcel CSV lookup error: {e}", exc_info=True)
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
        
        # Query Orange County ArcGIS REST API
        url = "https://vgispublic.ocpafl.org/server/rest/services/DynamicForJs/PARCEL/MapServer/4/query"
        params = {
            'where': f"PARCEL='{api_parcel_id}'",
            'outFields': 'PARCEL,LATITUDE,LONGITUDE,SITUS',
            'returnGeometry': 'false',
            'f': 'json'
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('features') or len(data['features']) == 0:
            logger.info(f"No results found for Orange County parcel: {parcel_id}")
            return None
        
        # Extract coordinates from first feature
        feature = data['features'][0]
        attributes = feature.get('attributes', {})
        
        latitude = attributes.get('LATITUDE')
        longitude = attributes.get('LONGITUDE')
        situs = attributes.get('SITUS', 'No Address Available')
        
        if latitude is None or longitude is None:
            logger.warning(f"Missing coordinates for Orange County parcel: {parcel_id}")
            return None
        
        # Return in the same format as Brevard parcels
        return {
            "lat": str(latitude),
            "lng": str(longitude),
            "formatted_address": situs if situs != 'No Address Available' else "No Address Available",
            "county": "Orange",
            "parcel_id": parcel_id,  # Keep original format with dashes
            "notes": f"Orange County Parcel - Parcel ID: {parcel_id}"
        }
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Orange County API request error: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Orange County parcel lookup error: {e}", exc_info=True)
        return None
