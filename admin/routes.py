# admin/routes.py - Cleaned up (removed ~400 lines of duplicate code!)
from flask import render_template, request, session, redirect, jsonify
from admin import admin_bp
from auth_utils import login_required
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# VIEW ROUTES ONLY - All business logic moved to /api/ endpoints
# =============================================================================


@admin_bp.route("/")
@login_required
def admin_dashboard():
    """Main admin dashboard - redirects to SPA"""
    if session.get("role") != "admin":
        return redirect("/")
    return render_template("admin_spa.html")


@admin_bp.route("/spa")
@login_required
def admin_spa():
    """Explicit SPA route for navigation"""
    if session.get("role") != "admin":
        return redirect("/")
    return render_template("admin_spa.html")


@admin_bp.route("/users")
@login_required
def admin_users_view():
    """User management view (traditional HTML page)"""
    if session.get("role") != "admin":
        return redirect("/")

    # This now just renders the template - data loaded via API
    return render_template("admin.html")


@admin_bp.route("/jobs")
@login_required
def admin_jobs_view():
    """Job management view (traditional HTML page)"""
    if session.get("role") != "admin":
        return redirect("/")

    # Get filter parameters for the template (optional)
    filters = {
        "job_number": request.args.get("job_number", ""),
        "client": request.args.get("client", ""),
        "status": request.args.get("status", ""),
        "address": request.args.get("address", ""),
        "page": request.args.get("page", 1, type=int),
        "per_page": request.args.get("per_page", 20, type=int),
    }

    # Status options for dropdowns
    status_options = [
        "On Hold/Pending",
        "Needs Fieldwork",
        "Fieldwork Complete/Needs Office Work",
        "To Be Printed/Packaged",
        "Survey Complete/Invoice Sent/Unpaid",
        "Set/Flag Pins",
        "Completed/To Be Filed",
        "Ongoing Site Plan",
    ]

    return render_template(
        "admin_jobs.html", filters=filters, status_options=status_options
    )


# =============================================================================
# API PROXY ROUTES - For SPA to get data with admin session validation
# These proxy to our main API but add admin-only session checks
# =============================================================================


@admin_bp.route("/api/dashboard")
@login_required
def api_dashboard():
    """Dashboard data endpoint - SIMPLIFIED"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        from models import Job, User, db

        active_filter = Job.deleted_at.is_(None)

        total_jobs = (
            db.session.query(func.count(Job.id)).filter(active_filter).scalar() or 0
        )
        total_users = db.session.query(func.count(User.id)).scalar() or 0

        status_rows = (
            db.session.query(Job.status, func.count(Job.id))
            .filter(active_filter)
            .group_by(Job.status)
            .all()
        )
        status_counts = {
            (status or "Unknown"): count for status, count in status_rows
        }

        unique_clients = (
            db.session.query(
                func.count(
                    func.distinct(
                        func.lower(func.trim(Job.client))
                    )
                )
            )
            .filter(
                active_filter,
                Job.client.isnot(None),
                func.trim(Job.client) != "",
            )
            .scalar()
            or 0
        )

        deleted_jobs_total = (
            db.session.query(func.count(Job.id))
            .filter(Job.deleted_at.isnot(None))
            .scalar()
            or 0
        )

        recent_jobs_query = (
            db.session.query(
                Job.job_number,
                Job.client,
                Job.status,
                Job.created_at,
            )
            .filter(active_filter)
            .order_by(Job.created_at.desc())
            .limit(5)
            .all()
        )
        recent_jobs = [
            {
                "job_number": row.job_number,
                "client": row.client,
                "status": row.status,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in recent_jobs_query
        ]

        return jsonify(
            {
                "total_jobs": total_jobs,
                "total_users": total_users,
                "status_counts": status_counts,
                "recent_jobs": recent_jobs,
                "unique_clients": unique_clients,
                "deleted_jobs": deleted_jobs_total,
            }
        )

    except Exception as e:
        logger.error(f"Dashboard API error: {e}", exc_info=True)
        return jsonify(
            {
                "total_jobs": 0,
                "total_users": 0,
                "status_counts": {},
                "recent_jobs": [],
                "error": str(e),
            }
        ), 500


@admin_bp.route("/api/jobs")
@login_required
def api_jobs():
    """Jobs data endpoint for admin interface"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    # Proxy to our main API with current request parameters
    from api_routes import get_jobs

    return get_jobs()


@admin_bp.route("/api/users")
@login_required
def api_users():
    """Users data endpoint for admin interface"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    # Proxy to our main API
    from api_routes import get_users

    return get_users()
