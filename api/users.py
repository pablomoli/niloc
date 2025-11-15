# Generated from api_routes.py split
import logging
from datetime import datetime, timezone

from flask import jsonify, request, session
from sqlalchemy import func, or_

from api import api_bp, require_admin
from auth_utils import hash_password
from auth_utils import login_required
from models import db, Job, Tag, FieldWork, User, job_tags
from db_utils import with_db_retry, handle_db_error
from utils import get_brevard_property_link

logger = logging.getLogger(__name__)

@api_bp.route("/users", methods=["GET"])
@login_required
def get_users():
    """GET /api/users - List all users (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    # Hide "pablo" user from admin panel
    users = User.query.filter(User.username != "pablo").all()
    return jsonify([user.to_dict() for user in users])


@api_bp.route("/users", methods=["POST"])
@login_required
def create_user():
    """POST /api/users - Create new user (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate required fields
    required_fields = ["username", "name", "password", "role"]
    missing_fields = [
        field for field in required_fields if not data.get(field, "").strip()
    ]
    if missing_fields:
        return jsonify(
            {"error": f"Missing required fields: {', '.join(missing_fields)}"}
        ), 400

    # Validate role
    if data["role"] not in ["admin", "user"]:
        return jsonify({"error": 'Role must be "admin" or "user"'}), 400

    # Check for duplicate username
    existing_user = User.query.filter_by(username=data["username"].strip()).first()
    if existing_user:
        return jsonify({"error": "Username already exists"}), 409

    try:
        user = User(
            username=data["username"].strip(),
            name=data["name"].strip(),
            password=hash_password(data["password"]),
            role=data["role"],
            created_at=datetime.now(timezone.utc),
        )

        db.session.add(user)
        db.session.commit()

        return jsonify(
            {"message": "User created successfully", "user": user.to_dict()}
        ), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>", methods=["PUT"])
@login_required
def update_user(user_id):
    """PUT /api/users/123 - Update user (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Validate username if provided
    if "username" in data:
        new_username = data["username"].strip()
        if not new_username:
            return jsonify({"error": "Username cannot be empty"}), 400

        # Check for duplicate username (excluding current user)
        existing = User.query.filter(
            User.username == new_username, User.id != user_id
        ).first()
        if existing:
            return jsonify({"error": "Username already exists"}), 409

        user.username = new_username

    # Update name if provided
    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            return jsonify({"error": "Name cannot be empty"}), 400
        user.name = new_name

    # Update password if provided
    if "password" in data and data["password"].strip():
        user.password = hash_password(data["password"])

    # Update role if provided
    if "role" in data:
        if data["role"] not in ["admin", "user"]:
            return jsonify({"error": 'Role must be "admin" or "user"'}), 400
        user.role = data["role"]

    try:
        db.session.commit()
        return jsonify({"message": "User updated successfully", "user": user.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>", methods=["DELETE"])
@login_required
def delete_user(user_id):
    """DELETE /api/users/123 - Delete user (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Multiple protection checks
    if user.username == "pablo":
        return jsonify({"error": "Cannot delete this user"}), 403

    if user.role == "admin":
        return jsonify({"error": "Cannot delete admin users"}), 403

    if user.id == session.get("user_id"):
        return jsonify({"error": "Cannot delete your own account"}), 403

    try:
        username = user.username
        db.session.delete(user)
        db.session.commit()

        return jsonify({"message": f"User {username} deleted successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>/password", methods=["PUT"])
@login_required
def reset_user_password(user_id):
    """PUT /api/users/123/password - Reset user password (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data or not data.get("password", "").strip():
        return jsonify({"error": "Password is required"}), 400

    try:
        user.password = hash_password(data["password"])
        db.session.commit()

        return jsonify({"message": f"Password reset for {user.name}"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/users/<int:user_id>/role", methods=["PUT"])
@login_required
def update_user_role(user_id):
    """PUT /api/users/123/role - Toggle user role (admin only)"""
    admin_check = require_admin()
    if admin_check:
        return admin_check

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        # Toggle role
        user.role = "admin" if user.role == "user" else "user"
        db.session.commit()

        return jsonify(
            {
                "message": f"{user.name} role changed to {user.role}",
                "user": user.to_dict(),
            }
        )
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Database error occurred"}), 500
