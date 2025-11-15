# Generated from api_routes.py split
import logging
from datetime import datetime, timezone

from flask import jsonify, request, session
from sqlalchemy import func, or_

from api import api_bp, require_admin, validate_job_data, geocode_address
from auth_utils import login_required
from models import db, Job, Tag, FieldWork, User, job_tags
from db_utils import with_db_retry, handle_db_error
from utils import get_brevard_property_link

logger = logging.getLogger(__name__)

@api_bp.route("/tags", methods=["GET"])
@login_required
def list_tags():
    include_usage = request.args.get("include_usage", "false").lower() == "true"
    tags = Tag.query.order_by(Tag.name.asc()).all()
    if not include_usage:
        return jsonify([t.to_dict() for t in tags])

    # Add job_count for each tag
    counts = dict(
        db.session.query(job_tags.c.tag_id, func.count(job_tags.c.job_id))
        .group_by(job_tags.c.tag_id)
        .all()
    )
    enriched = []
    for t in tags:
        d = t.to_dict()
        d["job_count"] = int(counts.get(t.id, 0))
        enriched.append(d)
    return jsonify(enriched)


@api_bp.route("/tags", methods=["POST"])
@login_required
def create_tag():
    admin_check = require_admin()
    if admin_check:
        return admin_check
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    color = (data.get("color") or "#007bff").strip() or "#007bff"
    if not name:
        return jsonify({"error": "Tag name is required"}), 400
    existing = Tag.query.filter_by(name=name).first()
    if existing:
        return jsonify({"error": "Tag name already exists"}), 409
    try:
        tag = Tag(name=name, color=color, created_at=datetime.now(timezone.utc))
        db.session.add(tag)
        db.session.commit()
        return jsonify(tag.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/tags/<int:tag_id>", methods=["PUT"])
@login_required
def update_tag(tag_id):
    admin_check = require_admin()
    if admin_check:
        return admin_check
    tag = Tag.query.get(tag_id)
    if not tag:
        return jsonify({"error": "Tag not found"}), 404
    data = request.get_json() or {}
    if "name" in data:
        new_name = (data.get("name") or "").strip()
        if not new_name:
            return jsonify({"error": "Tag name cannot be empty"}), 400
        exists = Tag.query.filter(Tag.id != tag_id, Tag.name == new_name).first()
        if exists:
            return jsonify({"error": "Tag name already exists"}), 409
        tag.name = new_name
    if "color" in data:
        color = (data.get("color") or "").strip() or "#007bff"
        tag.color = color
    try:
        db.session.commit()
        return jsonify(tag.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/tags/<int:tag_id>", methods=["DELETE"])
@login_required
def delete_tag(tag_id):
    admin_check = require_admin()
    if admin_check:
        return admin_check
    tag = Tag.query.get(tag_id)
    if not tag:
        return jsonify({"error": "Tag not found"}), 404
    # Do not allow delete if tag is in use
    usage = (
        db.session.query(func.count(job_tags.c.job_id))
        .filter(job_tags.c.tag_id == tag_id)
        .scalar()
    )
    if usage and usage > 0:
        return jsonify({"error": "Tag is in use and cannot be deleted"}), 409

    try:
        db.session.delete(tag)
        db.session.commit()
        return jsonify({"message": "Tag deleted"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


# =============================================================================
# JOB TAGGING ENDPOINTS
# =============================================================================


@api_bp.route("/jobs/<job_number>/tags", methods=["GET"])
@login_required
def get_job_tags(job_number):
    job = Job.find_by_number(job_number, include_deleted=False)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify([t.to_dict() for t in job.tags])


@api_bp.route("/jobs/<job_number>/tags", methods=["POST"])
@login_required
def add_tag_to_job(job_number):
    job = Job.find_by_number(job_number, include_deleted=False)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    data = request.get_json() or {}
    tag_id = data.get("tag_id")
    tag_name = (data.get("name") or "").strip()

    tag = None
    if tag_id:
        tag = Tag.query.get(tag_id)
    elif tag_name:
        tag = Tag.query.filter_by(name=tag_name).first()
        if not tag:
            # Only admin may create-on-the-fly
            if session.get("role") == "admin":
                tag = Tag(
                    name=tag_name,
                    color=(data.get("color") or "#007bff").strip() or "#007bff",
                    created_at=datetime.now(timezone.utc),
                )
                db.session.add(tag)
            else:
                return jsonify({"error": "Tag not found. Ask admin to create it."}), 404
    else:
        return jsonify({"error": "Provide tag_id or name"}), 400

    if not tag:
        return jsonify({"error": "Tag not found"}), 404

    if tag in job.tags:
        return jsonify({"message": "Tag already assigned", "tags": [t.to_dict() for t in job.tags]})

    try:
        job.tags.append(tag)
        db.session.commit()
        return jsonify({"message": "Tag added", "tags": [t.to_dict() for t in job.tags]})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500


@api_bp.route("/jobs/<job_number>/tags/<int:tag_id>", methods=["DELETE"])
@login_required
def remove_tag_from_job(job_number, tag_id):
    job = Job.find_by_number(job_number, include_deleted=False)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    tag = Tag.query.get(tag_id)
    if not tag:
        return jsonify({"error": "Tag not found"}), 404
    if tag not in job.tags:
        return jsonify({"message": "Tag not on job", "tags": [t.to_dict() for t in job.tags]})
    try:
        job.tags.remove(tag)
        db.session.commit()
        return jsonify({"message": "Tag removed", "tags": [t.to_dict() for t in job.tags]})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
