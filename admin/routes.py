# admin/routes.py - Cleaned up (removed ~400 lines of duplicate code!)
from flask import render_template, request, session, redirect, jsonify
from admin import admin_bp
from auth_utils import login_required

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
        from models import Job, User

        # Get all active jobs directly from database
        jobs = Job.active().order_by(Job.created_at.desc()).all()
        total_jobs = len(jobs)

        # Get total users
        total_users = User.query.count()

        # Get recent jobs (first 5)
        recent_jobs = [job.to_dict() for job in jobs[:5]]

        # Count jobs by status
        status_counts = {}
        for job in jobs:
            status = job.status or "Unknown"
            status_counts[status] = status_counts.get(status, 0) + 1

        return jsonify(
            {
                "total_jobs": total_jobs,
                "total_users": total_users,
                "status_counts": status_counts,
                "recent_jobs": recent_jobs,
            }
        )

    except Exception as e:
        print(f"Dashboard API error: {e}")
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
