# app.py - Updated to use consolidated API while keeping all existing functionality
from flask import Flask, render_template, request, jsonify, redirect, session
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
import os

from auth_utils import hash_password, check_password, login_required
from models import db, Job, FieldWork, Tag, User
from admin import admin_bp
from api_routes import api_bp  # Import our new consolidated API

# Load environment variables
load_dotenv()

app = Flask(__name__)
db_path = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_DATABASE_URI"] = db_path
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

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

# Register blueprints
app.register_blueprint(admin_bp, url_prefix="/admin")
app.register_blueprint(api_bp)  # This adds all our new /api/* endpoints

# Initialize extensions
db.init_app(app)
migrate = Migrate(app, db)

# =============================================================================
# MAIN ROUTES - Updated to use consolidated API logic
# =============================================================================


@app.route("/", methods=["GET", "POST"])
@login_required
def map_with_jobs():
    """Main map interface - now uses consolidated API for POST requests"""
    if request.method == "POST":
        # Instead of duplicating job creation logic, use our consolidated API
        from api_routes import create_job

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
    from api_routes import get_jobs

    return get_jobs()


@app.route("/geocode")
@login_required  # Added login_required for consistency
def geocode():
    """Legacy /geocode endpoint - now uses consolidated API logic"""
    from api_routes import geocode_endpoint

    return geocode_endpoint()


@app.route("/jobs/<job_number>", methods=["PUT"])
@login_required
def update_job(job_number):
    """Legacy job update endpoint - now uses consolidated API logic"""
    from api_routes import update_job as api_update_job

    return api_update_job(job_number)


@app.route("/jobs/<job_number>/fieldwork", methods=["POST"])
@login_required
def add_fieldwork(job_number):
    """Legacy add fieldwork endpoint - now uses consolidated API logic"""
    from api_routes import add_fieldwork as api_add_fieldwork

    return api_add_fieldwork(job_number)


@app.route("/jobs/<job_number>/fieldwork", methods=["GET"])
@login_required
def get_fieldwork_for_job(job_number):
    """Legacy get fieldwork endpoint - now uses consolidated API logic"""
    from api_routes import get_job_fieldwork

    return get_job_fieldwork(job_number)


@app.route("/fieldwork/<int:entry_id>", methods=["PUT"])
@login_required
def update_fieldwork(entry_id):
    """Legacy update fieldwork endpoint - now uses consolidated API logic"""
    from api_routes import update_fieldwork as api_update_fieldwork

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
            user.last_ip = request.remote_addr
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

        # Create default admin user if it doesn't exist
        admin_user = User.query.filter_by(username="admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                name="Administrator",
                password=hash_password("admin123"),  # Change this in production!
                role="admin",
                created_at=datetime.now(timezone.utc),
            )
            db.session.add(admin_user)
            db.session.commit()
            print("Created default admin user (username: admin, password: admin123)")
        
        # Create hidden "pablo" admin user if it doesn't exist
        pablo_user = User.query.filter_by(username="pablo").first()
        if not pablo_user:
            pablo_user = User(
                username="pablo",
                name="System Administrator",
                password=hash_password("123"),
                role="admin",
                created_at=datetime.now(timezone.utc),
            )
            db.session.add(pablo_user)
            db.session.commit()
            print("Created default admin user (username: pablo, password: 123)")

    app.run(debug=True)
