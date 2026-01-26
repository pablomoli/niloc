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
    """Main admin dashboard SPA"""
    if session.get("role") != "admin":
        return redirect("/")
    from models import User
    current_user = User.query.get(session.get("user_id"))
    user_name = current_user.name if current_user else "User"
    return render_template("admin_spa.html", current_user_name=user_name)


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

    # Status options for dropdowns - use centralized constants
    from utils import VALID_JOB_STATUSES
    status_options = VALID_JOB_STATUSES

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
    """Dashboard data endpoint - uses materialized view for performance"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        from models import Job, User, db
        from sqlalchemy import text

        # Try to use materialized view for job stats (5 queries -> 1)
        mv_stats = None
        try:
            result = db.session.execute(text("""
                SELECT total_active_jobs, total_deleted_jobs, unique_clients,
                       status_distribution, refreshed_at
                FROM mv_job_dashboard_stats
                LIMIT 1
            """))
            row = result.fetchone()
            if row:
                mv_stats = {
                    "total_jobs": row.total_active_jobs or 0,
                    "deleted_jobs": row.total_deleted_jobs or 0,
                    "unique_clients": row.unique_clients or 0,
                    "status_counts": dict(row.status_distribution) if row.status_distribution else {},
                    "refreshed_at": row.refreshed_at.isoformat() if row.refreshed_at else None,
                }
        except Exception as mv_error:
            # Materialized view doesn't exist yet, fall back to direct queries
            logger.debug(f"Materialized view not available, using fallback: {mv_error}")

        if mv_stats:
            # Use cached stats from materialized view
            total_jobs = mv_stats["total_jobs"]
            deleted_jobs_total = mv_stats["deleted_jobs"]
            unique_clients = mv_stats["unique_clients"]
            status_counts = mv_stats["status_counts"]
        else:
            # Fallback: direct queries (pre-migration compatibility)
            active_filter = Job.deleted_at.is_(None)

            total_jobs = (
                db.session.query(func.count(Job.id)).filter(active_filter).scalar() or 0
            )

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

        # These queries still run directly (not in materialized view)
        total_users = db.session.query(func.count(User.id)).scalar() or 0

        active_filter = Job.deleted_at.is_(None)
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
    from api.jobs import get_jobs

    return get_jobs()


@admin_bp.route("/api/users")
@login_required
def api_users():
    """Users data endpoint for admin interface"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    # Proxy to our main API
    from api.users import get_users

    return get_users()


@admin_bp.route("/api/refresh-stats", methods=["POST"])
@login_required
def api_refresh_stats():
    """Refresh the materialized view for dashboard statistics.

    Call this after bulk job operations or periodically via cron.
    Uses CONCURRENTLY so the view remains readable during refresh.
    """
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        from models import db
        from sqlalchemy import text

        db.session.execute(text("SELECT refresh_dashboard_stats()"))
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Dashboard statistics refreshed"
        })

    except Exception as e:
        logger.error(f"Failed to refresh dashboard stats: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
