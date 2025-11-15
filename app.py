# app.py - Updated to use consolidated API while keeping all existing functionality
import os
import logging
from datetime import datetime, timezone, timedelta

from flask import Flask, render_template, request, jsonify, redirect, session, send_from_directory
from flask_migrate import Migrate
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    from flask_compress import Compress  # type: ignore
    _compress_available = True
except Exception:
    Compress = None  # type: ignore
    _compress_available = False

from auth_utils import check_password, login_required, get_client_ip
from models import db, User
from admin import admin_bp
from api import api_bp  # Import API blueprint from modular structure

# Load environment variables
load_dotenv()

app = Flask(__name__)
db_path = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_DATABASE_URI"] = db_path
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = timedelta(days=365)

# Configure connection pooling for better reliability with Supabase
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,  # Test connections before using them
    "pool_recycle": 300,    # Recycle connections after 5 minutes
    "pool_size": 5,         # Number of connections to maintain in pool
    "max_overflow": 10,     # Maximum overflow connections allowed
    "connect_args": {
        "connect_timeout": 10,  # Connection timeout in seconds
        "options": "-c statement_timeout=30000"  # 30 second statement timeout
    }
}

app.secret_key = os.getenv("SESSION_KEY")
app.permanent_session_lifetime = timedelta(days=30)

# Enable gzip/brotli compression for text assets and JSON
if _compress_available:
    app.config.update(
        COMPRESS_MIMETYPES=[
            "text/html",
            "text/css",
            "text/javascript",
            "application/javascript",
            "application/json",
            "image/svg+xml",
            "text/plain",
        ],
        COMPRESS_LEVEL=6,
        COMPRESS_BR=True,
        COMPRESS_MIN_SIZE=1024,
    )
    Compress(app)

# Register blueprints
app.register_blueprint(admin_bp, url_prefix="/admin")
app.register_blueprint(api_bp)  # This adds all our new /api/* endpoints

# Initialize extensions
db.init_app(app)
migrate = Migrate(app, db)

# Expose a stable static version for cache-busting (env or file mtime)
STATIC_VERSION = os.getenv("STATIC_VERSION")
if not STATIC_VERSION:
    try:
        css_path = os.path.join(app.root_path, "static", "dist", "app.css")
        mtime = int(os.path.getmtime(css_path))
        STATIC_VERSION = str(mtime)
    except Exception:
        STATIC_VERSION = "1"


@app.context_processor
def _inject_static_version():
    return {"static_version": STATIC_VERSION}


@app.route("/favicon.ico")
def favicon():
    """Serve favicon from existing PNG to stop 404s."""
    return send_from_directory(
        os.path.join(app.root_path, "static", "data"),
        "EMS-llc-4.png",
        mimetype="image/png",
        conditional=True,
    )

# =============================================================================
# MAIN ROUTES - Updated to use consolidated API logic
# =============================================================================


@app.route("/", methods=["GET", "POST"])
@login_required
def map_with_jobs():
    """Main map interface - now uses consolidated API for POST requests"""
    if request.method == "POST":
        # Instead of duplicating job creation logic, use our consolidated API
        from api.jobs import create_job

        return create_job()

    return render_template("map.html")


# =============================================================================
# BACKWARD COMPATIBILITY ROUTES - Keep existing URLs working
# These routes now use the consolidated API logic instead of duplicating code
# =============================================================================


@app.route("/jobs")
@login_required
def jobs():
    """Legacy /jobs endpoint - now uses consolidated API logic"""
    from api.jobs import get_jobs

    return get_jobs()


@app.route("/geocode")
@login_required  # Added login_required for consistency
def geocode():
    """Legacy /geocode endpoint - now uses consolidated API logic"""
    from api.geocoding import geocode_endpoint

    return geocode_endpoint()


@app.route("/jobs/<job_number>", methods=["PUT"])
@login_required
def update_job(job_number):
    """Legacy job update endpoint - now uses consolidated API logic"""
    from api.jobs import update_job as api_update_job

    return api_update_job(job_number)


@app.route("/jobs/<job_number>/fieldwork", methods=["POST"])
@login_required
def add_fieldwork(job_number):
    """Legacy add fieldwork endpoint - now uses consolidated API logic"""
    from api.fieldwork import add_fieldwork as api_add_fieldwork

    return api_add_fieldwork(job_number)


@app.route("/jobs/<job_number>/fieldwork", methods=["GET"])
@login_required
def get_fieldwork_for_job(job_number):
    """Legacy get fieldwork endpoint - now uses consolidated API logic"""
    from api.fieldwork import get_job_fieldwork

    return get_job_fieldwork(job_number)


@app.route("/fieldwork/<int:entry_id>", methods=["PUT"])
@login_required
def update_fieldwork(entry_id):
    """Legacy update fieldwork endpoint - now uses consolidated API logic"""
    from api.fieldwork import update_fieldwork as api_update_fieldwork

    return api_update_fieldwork(entry_id)


# =============================================================================
# AUTHENTICATION ROUTES - Keep exactly as they were
# =============================================================================


@app.route("/login", methods=["GET", "POST"])
def login():
    """User authentication - unchanged"""
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        user = User.query.filter_by(username=username).first()

        if user and check_password(password, user.password):
            session.permanent = user.role == "admin"
            session["user_id"] = user.id
            session["role"] = user.role
            user.last_login = datetime.now(timezone.utc)
            user.last_ip = get_client_ip()
            db.session.commit()
            return redirect("/")
        return render_template("login.html", error="Invalid credentials")
    return render_template("login.html")


@app.route("/logout")
def logout():
    """Clear session and redirect to login - unchanged"""
    session.clear()
    return redirect("/login")


# =============================================================================
# ERROR HANDLERS - Added for better error handling
# =============================================================================


@app.after_request
def add_cache_headers(response):
    """Add cache headers to static files - consolidated handler"""
    # Handle static files (both /static/ path and static endpoint)
    if request.path.startswith("/static/") or request.endpoint == "static":
        # If versioned, allow long-lived immutable caching
        if request.args.get("v") or request.path.startswith("/static/"):
            response.headers.setdefault(
                "Cache-Control", "public, max-age=31536000, immutable"
            )
        else:
            # Shorter default to allow timely updates
            response.headers.setdefault(
                "Cache-Control", "public, max-age=300"
            )
    return response


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint not found"}), 404
    return render_template("login.html", error="Page not found"), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    db.session.rollback()
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error"}), 500
    return render_template("login.html", error="Internal server error"), 500


@app.errorhandler(403)
def forbidden(error):
    """Handle 403 errors"""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Access forbidden"}), 403
    return render_template("login.html", error="Access forbidden"), 403


# =============================================================================
# APPLICATION STARTUP
# =============================================================================

if __name__ == "__main__":
    with app.app_context():
        db.create_all()

    # Use environment variable to control debug mode
    # Default to False for security (production-safe)
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", "5000"))
    
    if debug_mode:
        logger.warning("Running in DEBUG mode - not recommended for production!")
    
    app.run(debug=debug_mode, host=host, port=port)
