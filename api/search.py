# Generated from api_routes.py split
import logging
from datetime import datetime, timezone
from functools import wraps

from flask import jsonify, request, session
from sqlalchemy import func, or_
import re

from api import api_bp, require_admin
from auth_utils import login_required
from models import db, Job, Tag, FieldWork, User, job_tags
from db_utils import with_db_retry, handle_db_error

logger = logging.getLogger(__name__)

def normalize_search_term(term):
    """
    Normalize search term for comprehensive fuzzy matching
    Handles: case, spaces, punctuation, common abbreviations
    """
    if not term:
        return ""

    # Convert to lowercase
    normalized = term.lower().strip()

    # Remove common punctuation and replace with spaces
    normalized = re.sub(r"[-_.,/#!$%^&*;:{}=`~()]", " ", normalized)

    # Replace multiple spaces with single space
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # Common abbreviations and variations
    abbreviations = {
        "st": "street",
        "ave": "avenue",
        "rd": "road",
        "dr": "drive",
        "ln": "lane",
        "ct": "court",
        "blvd": "boulevard",
        "n": "north",
        "s": "south",
        "e": "east",
        "w": "west",
        "ne": "northeast",
        "nw": "northwest",
        "se": "southeast",
        "sw": "southwest",
    }

    # Replace abbreviations (as whole words only)
    for abbr, full in abbreviations.items():
        normalized = re.sub(r"\b" + abbr + r"\b", full, normalized)

    return normalized


def create_fuzzy_search_conditions(search_term, fields):
    """
    Create comprehensive fuzzy search conditions
    Returns multiple OR conditions for maximum match capability
    """
    if not search_term or not fields:
        return None

    conditions = []

    # Original term variations
    original = search_term.strip()
    normalized = normalize_search_term(original)
    no_spaces = original.replace(" ", "").lower()

    # Create search patterns
    patterns = [
        f"%{original.lower()}%",  # Exact case-insensitive
        f"%{normalized}%",  # Normalized version
        f"%{no_spaces}%",  # No spaces version
    ]

    # Add individual word patterns for multi-word searches
    words = normalized.split()
    if len(words) > 1:
        for word in words:
            if len(word) > 2:  # Skip very short words
                patterns.append(f"%{word}%")

    # Remove duplicates while preserving order
    unique_patterns = []
    for pattern in patterns:
        if pattern not in unique_patterns:
            unique_patterns.append(pattern)

    # Create conditions for each field and pattern combination
    for field in fields:
        # Normalize whitespace variations for the field
        try:
            normalized_whitespace_field = func.regexp_replace(
                field, r"\s+", " ", "g"
            )
        except Exception:
            normalized_whitespace_field = None

        try:
            stripped_whitespace_field = func.regexp_replace(
                field, r"\s+", "", "g"
            )
        except Exception:
            stripped_whitespace_field = None

        for pattern in unique_patterns:
            # Basic ILIKE search
            conditions.append(field.ilike(pattern))

            if normalized_whitespace_field is not None:
                conditions.append(normalized_whitespace_field.ilike(pattern))

            # Remove punctuation from field for matching (simplified version)
            try:
                conditions.append(
                    func.regexp_replace(
                        field, r"[-_.,/#!$%^&*;:{}=`~()]", " ", "g"
                    ).ilike(pattern)
                )
                if normalized_whitespace_field is not None:
                    conditions.append(
                        func.regexp_replace(
                            normalized_whitespace_field,
                            r"[-_.,/#!$%^&*;:{}=`~()]",
                            " ",
                            "g",
                        ).ilike(pattern)
                    )
            except Exception as e:
                # If regexp_replace fails (e.g., database doesn't support it), just use basic ilike
                logger.debug(f"regexp_replace not available, using basic ilike: {e}")
                pass

        if stripped_whitespace_field is not None and no_spaces:
            # Allow matching when both the field and search term ignore whitespace
            conditions.append(
                stripped_whitespace_field.ilike(f"%{no_spaces}%")
            )

    if conditions:
        return or_(*conditions)
    return None


def monitor_search_performance(f):
    """Decorator to monitor search performance"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        import time  # Import time inside the function

        start_time = time.time()
        result = f(*args, **kwargs)
        end_time = time.time()

        # Log slow searches (> 500ms)
        duration = (end_time - start_time) * 1000
        if duration > 500:
            search_term = request.args.get("q", "")
            logger.warning(f"SLOW SEARCH: {duration:.2f}ms for term: '{search_term}'")

        return result

    return decorated_function


@api_bp.route("/jobs/search", methods=["GET"])
@login_required
@monitor_search_performance
def search_jobs():
    """
    GET /api/jobs/search - Real-time fuzzy search across ALL jobs
    Query params: q (search term), status, include_deleted
    Returns matching jobs with result limit (max 500)
    """
    try:
        # Get search parameters
        search_term = request.args.get("q", "").strip()
        status_filter = request.args.get("status", "").strip()
        include_deleted = request.args.get("include_deleted", "false").lower() == "true"

        # Start with base query with eager loading
        from sqlalchemy.orm import joinedload
        if include_deleted:
            query = Job.query.options(joinedload(Job.tags))  # Include deleted jobs
        else:
            query = Job.active().options(joinedload(Job.tags))  # Only active jobs

        # Apply comprehensive fuzzy search
        if search_term:
            search_fields = [Job.job_number, Job.client, Job.address]
            # Add parcel_id when we add that field in Sprint 1c
            # search_fields.append(Job.parcel_id)

            search_condition = create_fuzzy_search_conditions(
                search_term, search_fields
            )
            if search_condition is not None:
                query = query.filter(search_condition)

        # Apply status filter if provided
        if status_filter:
            query = query.filter(Job.status == status_filter)

        # Order by relevance, then by newest first
        if search_term:
            # Score results by relevance (exact matches first) - SIMPLIFIED VERSION
            search_lower = search_term.lower()

            # Create ordering that works with your SQLAlchemy version
            query = query.order_by(
                func.lower(Job.job_number)
                .like(f"{search_lower}%")
                .desc(),  # Job number starts with search
                func.lower(Job.client)
                .like(f"{search_lower}%")
                .desc(),  # Client starts with search
                Job.created_at.desc(),  # Then by newest
            )
        else:
            query = query.order_by(Job.created_at.desc())

        # Execute query with result limit to prevent huge responses
        MAX_SEARCH_RESULTS = 500
        jobs = query.limit(MAX_SEARCH_RESULTS).all()

        # Return results with metadata
        return jsonify(
            {
                "jobs": [job.to_dict() for job in jobs],
                "total": len(jobs),
                "search_term": search_term,
                "status_filter": status_filter,
                "include_deleted": include_deleted,
                "fuzzy_matching": True,
                "limit_applied": len(jobs) >= MAX_SEARCH_RESULTS,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        return jsonify({"error": "Search failed", "jobs": [], "total": 0}), 500


@api_bp.route("/jobs/search/autocomplete", methods=["GET"])
@login_required
@monitor_search_performance
def search_autocomplete():
    """
    GET /api/jobs/search/autocomplete - Get intelligent search suggestions
    Query params: q (partial search term), limit (default 10)
    Returns suggestions for job numbers, clients, and addresses with fuzzy matching
    """
    try:
        search_term = request.args.get("q", "").strip()
        limit = min(int(request.args.get("limit", 10)), 50)  # Cap at 50 results

        if len(search_term) < 2:  # Don't search for very short terms
            return jsonify({"suggestions": []})

        # Prefer fast prefix search for autocomplete; then fallback to contains
        normalized_term = normalize_search_term(search_term)
        collapsed_term = normalized_term.replace(" ", "")

        prefix = f"{search_term}%"
        normalized_prefix = f"{normalized_term}%"
        collapsed_prefix = f"{collapsed_term}%" if collapsed_term else None

        contains = f"%{search_term}%"
        normalized_contains = f"%{normalized_term}%"
        collapsed_contains = f"%{collapsed_term}%" if collapsed_term else None

        suggestions = []

        # Jobs: job_number prefix
        try:
            job_numbers = (
                db.session.query(Job.job_number)
                .filter(Job.deleted_at.is_(None), Job.job_number.ilike(prefix))
                .distinct()
                .limit(max(1, limit // 3))
                .all()
            )
            for (job_number,) in job_numbers:
                if not any(s["value"] == job_number for s in suggestions):
                    suggestions.append(
                        {
                            "value": job_number,
                            "type": "job_number",
                            "label": f"Job: {job_number}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            logger.error(f"Job number autocomplete error: {e}", exc_info=True)

        # Jobs: client prefix
        try:
            client_prefix_conditions = [
                Job.client.ilike(prefix),
                Job.client.ilike(normalized_prefix),
                func.regexp_replace(Job.client, r"\s+", " ", "g").ilike(
                    normalized_prefix
                ),
            ]
            if collapsed_prefix:
                client_prefix_conditions.append(
                    func.regexp_replace(Job.client, r"\s+", "", "g").ilike(
                        collapsed_prefix
                    )
                )

            clients = (
                db.session.query(Job.client)
                .filter(
                    Job.deleted_at.is_(None),
                    or_(*client_prefix_conditions),
                )
                .distinct()
                .limit(max(1, limit // 3))
                .all()
            )
            for (client,) in clients:
                if client and not any(s["value"] == client for s in suggestions):
                    suggestions.append(
                        {
                            "value": client,
                            "type": "client",
                            "label": f"Client: {client}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            logger.error(f"Client autocomplete error: {e}", exc_info=True)

        # Jobs: address prefix
        try:
            addresses = (
                db.session.query(Job.address)
                .filter(
                    Job.deleted_at.is_(None),
                    or_(
                        Job.address.ilike(prefix),
                        Job.address.ilike(normalized_prefix),
                        func.regexp_replace(Job.address, r"\s+", " ", "g").ilike(
                            normalized_prefix
                        ),
                    ),
                )
                .distinct()
                .limit(max(1, limit // 3))
                .all()
            )
            for (address,) in addresses:
                if address and not any(s["value"] == address for s in suggestions):
                    display_address = address[:50] + "..." if len(address) > 50 else address
                    suggestions.append(
                        {
                            "value": address,
                            "type": "address",
                            "label": f"Address: {display_address}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            logger.error(f"Address autocomplete error: {e}", exc_info=True)

        # Tags: prefix
        try:
            tag_names = (
                db.session.query(Tag.name)
                .filter(Tag.name.ilike(prefix))
                .distinct()
                .limit(max(1, limit // 4))
                .all()
            )
            for (tag_name,) in tag_names:
                if tag_name and not any(
                    s["value"] == tag_name and s["type"] == "tag" for s in suggestions
                ):
                    suggestions.append(
                        {
                            "value": tag_name,
                            "type": "tag",
                            "label": f"Tag: {tag_name}",
                            "priority": 1,
                        }
                    )
        except Exception as e:
            logger.error(f"Tag autocomplete error: {e}", exc_info=True)

        # Fallback: contains search using trigram index when term is longer and results are few
        if len(search_term) >= 3 and len(suggestions) < limit:
            remaining = max(0, limit - len(suggestions))
            # Job numbers contains
            try:
                job_numbers_ct = (
                    db.session.query(Job.job_number)
                    .filter(Job.deleted_at.is_(None), Job.job_number.ilike(contains))
                    .distinct()
                    .limit(max(1, remaining // 3) or 1)
                    .all()
                )
                for (job_number,) in job_numbers_ct:
                    if not any(s["value"] == job_number for s in suggestions):
                        suggestions.append({
                            "value": job_number,
                            "type": "job_number",
                            "label": f"Job: {job_number}",
                            "priority": 2,
                        })
                        if len(suggestions) >= limit:
                            break
            except Exception as e:
                logger.error(f"Job number contains error: {e}", exc_info=True)

            if len(suggestions) < limit:
                remaining = max(0, limit - len(suggestions))
                # Clients contains
                try:
                    client_contains_conditions = [
                        Job.client.ilike(contains),
                        Job.client.ilike(normalized_contains),
                        func.regexp_replace(Job.client, r"\s+", " ", "g").ilike(
                            normalized_contains
                        ),
                    ]
                    if collapsed_contains:
                        client_contains_conditions.append(
                            func.regexp_replace(Job.client, r"\s+", "", "g").ilike(
                                collapsed_contains
                            )
                        )

                    clients_ct = (
                        db.session.query(Job.client)
                        .filter(
                            Job.deleted_at.is_(None),
                            or_(*client_contains_conditions),
                        )
                        .distinct()
                        .limit(max(1, remaining // 3) or 1)
                        .all()
                    )
                    for (client,) in clients_ct:
                        if client and not any(s["value"] == client for s in suggestions):
                            suggestions.append({
                                "value": client,
                                "type": "client",
                                "label": f"Client: {client}",
                                "priority": 2,
                            })
                            if len(suggestions) >= limit:
                                break
                except Exception as e:
                    logger.error(f"Client contains error: {e}", exc_info=True)

                if len(suggestions) < limit:
                    remaining = max(0, limit - len(suggestions))
                    # Addresses contains
                    addresses_ct = []
                    try:
                        addresses_ct = (
                            db.session.query(Job.address)
                            .filter(
                                Job.deleted_at.is_(None),
                                or_(
                                    Job.address.ilike(contains),
                                    Job.address.ilike(normalized_contains),
                                    func.regexp_replace(
                                        Job.address, r"\s+", " ", "g"
                                    ).ilike(normalized_contains),
                                ),
                            )
                            .distinct()
                            .limit(max(1, remaining // 3) or 1)
                            .all()
                        )
                    except Exception as e:
                        logger.error(f"Address contains error: {e}", exc_info=True)
                    else:
                        for (address,) in addresses_ct:
                            if address and not any(s["value"] == address for s in suggestions):
                                display_address = address[:50] + "..." if len(address) > 50 else address
                                suggestions.append({
                                    "value": address,
                                    "type": "address",
                                    "label": f"Address: {display_address}",
                                    "priority": 2,
                                })
                                if len(suggestions) >= limit:
                                    break

            if len(suggestions) < limit:
                remaining = max(0, limit - len(suggestions))
                # Tags contains
                try:
                    tags_ct = (
                        db.session.query(Tag.name)
                        .filter(Tag.name.ilike(contains))
                        .distinct()
                        .limit(max(1, remaining // 4) or 1)
                        .all()
                    )
                    for (tag_name,) in tags_ct:
                        if tag_name and not any(s["value"] == tag_name and s["type"] == "tag" for s in suggestions):
                            suggestions.append({
                                "value": tag_name,
                                "type": "tag",
                                "label": f"Tag: {tag_name}",
                                "priority": 2,
                            })
                            if len(suggestions) >= limit:
                                break
                except Exception as e:
                    logger.error(f"Tag contains error: {e}", exc_info=True)

        # Sort by type (job_number, client, address, tag), then alphabetically
        type_order = {"job_number": 0, "client": 1, "address": 2, "tag": 3}
        suggestions.sort(key=lambda x: (type_order.get(x["type"], 99), x["value"].lower()))

        return jsonify(
            {
                "suggestions": suggestions[:limit],
                "search_term": search_term,
                "fuzzy_matching": True,
            }
        )

    except Exception as e:
        logger.error(f"Autocomplete error: {e}", exc_info=True)
        return jsonify({"suggestions": []})
