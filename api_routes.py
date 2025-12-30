# api_routes.py - Legacy shim for modular API routes
#
# Routes now live in the api/ package. Import api to register all endpoints
# and re-export the blueprint and shared helpers for compatibility.

from api import api_bp, geocode_address, require_admin, validate_job_data

__all__ = ["api_bp", "geocode_address", "require_admin", "validate_job_data"]
