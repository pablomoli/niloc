# api/schedules.py - Schedule CRUD and routing optimization endpoints
import logging
import math
import re
from datetime import datetime, date, time, timedelta, timezone

from flask import jsonify, request, session, make_response

from api import api_bp
from auth_utils import login_required
from models import db, Job, Schedule, POI, Tag, job_tags

logger = logging.getLogger(__name__)


def parse_date(date_str):
    """Parse ISO date string to date object."""
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None


def parse_time(time_str):
    """Parse time string (HH:MM or HH:MM:SS) to time object."""
    if not time_str:
        return None
    try:
        # Handle both HH:MM and HH:MM:SS formats
        if len(time_str) == 5:  # HH:MM
            return datetime.strptime(time_str, "%H:%M").time()
        else:  # HH:MM:SS
            return datetime.strptime(time_str, "%H:%M:%S").time()
    except ValueError:
        return None


def get_week_start(d):
    """Get the Monday of the week containing the given date."""
    return d - timedelta(days=d.weekday())


def haversine_distance(lat1, lng1, lat2, lng2):
    """Calculate distance between two points in miles using Haversine formula."""
    R = 3959  # Earth radius in miles
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def optimize_route_order(schedules, start_lat=None, start_lng=None):
    """
    Optimize schedule order using nearest-neighbor algorithm.
    Returns schedules with updated route_order values.
    """
    if len(schedules) < 2:
        for i, s in enumerate(schedules):
            s.route_order = i + 1
        return schedules

    # Filter schedules with valid coordinates
    valid_schedules = []
    invalid_schedules = []
    for s in schedules:
        if s.job and s.job.lat and s.job.long:
            try:
                lat = float(s.job.lat)
                lng = float(s.job.long)
                if math.isfinite(lat) and math.isfinite(lng):
                    valid_schedules.append((s, lat, lng))
                else:
                    invalid_schedules.append(s)
            except (ValueError, TypeError):
                invalid_schedules.append(s)
        else:
            invalid_schedules.append(s)

    if len(valid_schedules) < 2:
        for i, s in enumerate(schedules):
            s.route_order = i + 1
        return schedules

    # Determine starting point
    if start_lat is not None and start_lng is not None:
        current_lat, current_lng = start_lat, start_lng
        unvisited = list(valid_schedules)
        optimized = []
    else:
        # Start from first job
        first = valid_schedules[0]
        current_lat, current_lng = first[1], first[2]
        unvisited = valid_schedules[1:]
        optimized = [first]

    # Nearest neighbor algorithm
    while unvisited:
        nearest_idx = 0
        nearest_dist = float('inf')

        for i, (s, lat, lng) in enumerate(unvisited):
            dist = haversine_distance(current_lat, current_lng, lat, lng)
            if dist < nearest_dist:
                nearest_dist = dist
                nearest_idx = i

        nearest = unvisited.pop(nearest_idx)
        optimized.append(nearest)
        current_lat, current_lng = nearest[1], nearest[2]

    # Assign route order
    result = []
    for i, (s, _, _) in enumerate(optimized):
        s.route_order = i + 1
        result.append(s)

    # Add invalid schedules at the end
    for i, s in enumerate(invalid_schedules):
        s.route_order = len(result) + i + 1
        result.append(s)

    return result


# =============================================================================
# CRUD ENDPOINTS
# =============================================================================


@api_bp.route("/schedules", methods=["GET"])
@login_required
def list_schedules():
    """
    GET /api/schedules - List schedules with optional filters.
    Query params:
        - date: specific date (YYYY-MM-DD)
        - start_date: range start
        - end_date: range end
        - job_id: filter by job
    """
    query = Schedule.query.join(Job).filter(Job.deleted_at.is_(None))

    # Filter by specific date
    date_filter = request.args.get("date")
    if date_filter:
        d = parse_date(date_filter)
        if d:
            query = query.filter(Schedule.scheduled_date == d)

    # Filter by date range
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    if start_date:
        d = parse_date(start_date)
        if d:
            query = query.filter(Schedule.scheduled_date >= d)
    if end_date:
        d = parse_date(end_date)
        if d:
            query = query.filter(Schedule.scheduled_date <= d)

    # Filter by job
    job_id = request.args.get("job_id")
    if job_id:
        try:
            query = query.filter(Schedule.job_id == int(job_id))
        except ValueError:
            pass

    schedules = query.order_by(
        Schedule.scheduled_date, Schedule.route_order, Schedule.start_time
    ).all()

    return jsonify([s.to_dict() for s in schedules])


@api_bp.route("/schedules/<int:schedule_id>", methods=["GET"])
@login_required
def get_schedule(schedule_id):
    """GET /api/schedules/<id> - Get specific schedule."""
    schedule = Schedule.query.get(schedule_id)
    if not schedule:
        return jsonify({"error": "Schedule not found"}), 404

    return jsonify(schedule.to_dict())


@api_bp.route("/schedules", methods=["POST"])
@login_required
def create_schedule():
    """
    POST /api/schedules - Create new schedule.
    Body: {
        job_id or job_number: required
        scheduled_date: required (YYYY-MM-DD)
        start_time: optional (HH:MM)
        end_time: optional (HH:MM)
        estimated_duration: optional (hours as float)
        notes: optional
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    # Find job by ID or job_number
    job = None
    if data.get("job_id"):
        job = Job.active().filter_by(id=data["job_id"]).first()
    elif data.get("job_number"):
        job = Job.active().filter_by(job_number=data["job_number"]).first()

    if not job:
        return jsonify({"error": "Job not found"}), 404

    # Parse scheduled date
    scheduled_date = parse_date(data.get("scheduled_date"))
    if not scheduled_date:
        return jsonify({"error": "Valid scheduled_date required (YYYY-MM-DD)"}), 400

    # Parse times
    start_time = parse_time(data.get("start_time"))
    end_time = parse_time(data.get("end_time"))

    # Validate time range
    if start_time and end_time and end_time <= start_time:
        return jsonify({"error": "end_time must be after start_time"}), 400

    # Parse estimated duration
    estimated_duration = None
    if data.get("estimated_duration"):
        try:
            estimated_duration = float(data["estimated_duration"])
            if estimated_duration <= 0:
                return jsonify({"error": "estimated_duration must be positive"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid estimated_duration"}), 400

    try:
        schedule = Schedule(
            job_id=job.id,
            scheduled_date=scheduled_date,
            start_time=start_time,
            end_time=end_time,
            estimated_duration=estimated_duration,
            created_by_id=session.get("user_id"),
        )

        db.session.add(schedule)
        db.session.commit()

        return jsonify({
            "message": "Schedule created successfully",
            "schedule": schedule.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Schedule creation error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/schedules/<int:schedule_id>", methods=["PUT"])
@login_required
def update_schedule(schedule_id):
    """PUT /api/schedules/<id> - Update schedule."""
    schedule = Schedule.query.get(schedule_id)
    if not schedule:
        return jsonify({"error": "Schedule not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON data required"}), 400

    try:
        # Update scheduled date
        if "scheduled_date" in data:
            scheduled_date = parse_date(data["scheduled_date"])
            if scheduled_date:
                schedule.scheduled_date = scheduled_date

        # Update times
        if "start_time" in data:
            schedule.start_time = parse_time(data["start_time"])
        if "end_time" in data:
            schedule.end_time = parse_time(data["end_time"])

        # Validate time range
        if schedule.start_time and schedule.end_time and schedule.end_time <= schedule.start_time:
            return jsonify({"error": "end_time must be after start_time"}), 400

        # Update estimated duration
        if "estimated_duration" in data:
            if data["estimated_duration"]:
                try:
                    duration = float(data["estimated_duration"])
                    if duration <= 0:
                        return jsonify({"error": "estimated_duration must be positive"}), 400
                    schedule.estimated_duration = duration
                except (ValueError, TypeError):
                    return jsonify({"error": "Invalid estimated_duration"}), 400
            else:
                schedule.estimated_duration = None

        # Update route order
        if "route_order" in data:
            try:
                schedule.route_order = int(data["route_order"]) if data["route_order"] else None
            except (ValueError, TypeError):
                pass

        db.session.commit()

        return jsonify({
            "message": "Schedule updated successfully",
            "schedule": schedule.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Schedule update error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


@api_bp.route("/schedules/<int:schedule_id>", methods=["DELETE"])
@login_required
def delete_schedule(schedule_id):
    """DELETE /api/schedules/<id> - Delete schedule."""
    schedule = Schedule.query.get(schedule_id)
    if not schedule:
        return jsonify({"error": "Schedule not found"}), 404

    try:
        db.session.delete(schedule)
        db.session.commit()
        return jsonify({"message": "Schedule deleted successfully"})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Schedule deletion error: {e}", exc_info=True)
        return jsonify({"error": "Database error occurred"}), 500


# =============================================================================
# WEEK VIEW ENDPOINT
# =============================================================================


@api_bp.route("/schedules/week/<date_str>", methods=["GET"])
@login_required
def get_week_schedules(date_str):
    """
    GET /api/schedules/week/<date> - Get all schedules for the week containing the date.
    Returns schedules grouped by day for calendar display.
    """
    d = parse_date(date_str)
    if not d:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    week_start = get_week_start(d)
    week_end = week_start + timedelta(days=6)

    schedules = (
        Schedule.query
        .join(Job)
        .filter(Job.deleted_at.is_(None))
        .filter(Schedule.scheduled_date >= week_start)
        .filter(Schedule.scheduled_date <= week_end)
        .order_by(Schedule.scheduled_date, Schedule.route_order, Schedule.start_time)
        .all()
    )

    # Group by date
    by_date = {}
    for s in schedules:
        date_key = s.scheduled_date.isoformat()
        if date_key not in by_date:
            by_date[date_key] = []
        by_date[date_key].append(s.to_dict())

    return jsonify({
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "schedules": by_date
    })


# =============================================================================
# ROUTE OPTIMIZATION ENDPOINTS
# =============================================================================


@api_bp.route("/schedules/optimize/<date_str>", methods=["POST"])
@login_required
def optimize_day_route(date_str):
    """
    POST /api/schedules/optimize/<date> - Optimize route order for a day.
    Uses nearest-neighbor algorithm starting from office POI if available.
    """
    d = parse_date(date_str)
    if not d:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    schedules = (
        Schedule.query
        .join(Job)
        .filter(Job.deleted_at.is_(None))
        .filter(Schedule.scheduled_date == d)
        .all()
    )

    if len(schedules) < 2:
        return jsonify({
            "message": "Need at least 2 schedules to optimize",
            "schedules": [s.to_dict() for s in schedules]
        })

    # Try to get office location as starting point
    start_lat, start_lng = None, None
    office = POI.query.filter(POI.name.ilike("%epicenter%")).first()
    if not office:
        office = POI.query.filter(POI.name.ilike("%office%")).first()
    if office:
        start_lat = float(office.lat)
        start_lng = float(office.lng)

    try:
        optimize_route_order(schedules, start_lat, start_lng)
        db.session.commit()

        return jsonify({
            "message": "Route optimized successfully",
            "schedules": [s.to_dict() for s in sorted(schedules, key=lambda x: x.route_order or 999)]
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Route optimization error: {e}", exc_info=True)
        return jsonify({"error": "Optimization failed"}), 500


@api_bp.route("/schedules/reorder/<date_str>", methods=["PUT"])
@login_required
def reorder_day_schedules(date_str):
    """
    PUT /api/schedules/reorder/<date> - Manually set route order for a day.
    Body: { schedule_ids: [id1, id2, id3, ...] } in desired order.
    """
    d = parse_date(date_str)
    if not d:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    data = request.get_json()
    if not data or not data.get("schedule_ids"):
        return jsonify({"error": "schedule_ids array required"}), 400

    schedule_ids = data["schedule_ids"]
    if not isinstance(schedule_ids, list):
        return jsonify({"error": "schedule_ids must be an array"}), 400

    try:
        # Fetch all schedules for the day
        schedules = (
            Schedule.query
            .filter(Schedule.scheduled_date == d)
            .all()
        )

        schedule_map = {s.id: s for s in schedules}

        # Update route order based on provided order
        for i, sid in enumerate(schedule_ids):
            if sid in schedule_map:
                schedule_map[sid].route_order = i + 1

        db.session.commit()

        return jsonify({
            "message": "Route order updated successfully",
            "schedules": [s.to_dict() for s in sorted(schedules, key=lambda x: x.route_order or 999)]
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Reorder error: {e}", exc_info=True)
        return jsonify({"error": "Reorder failed"}), 500


# =============================================================================
# ICAL EXPORT ENDPOINT
# =============================================================================


def escape_ics_text(text):
    """Escape special characters for iCal format."""
    if not text:
        return ""
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def generate_ics(schedules, calendar_name="Epic Map Schedule"):
    """Generate iCal format string from schedules."""
    # Florida timezone (America/New_York covers EST/EDT)
    tz_id = "America/New_York"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Epic Map System//Schedule//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(calendar_name)}",
        f"X-WR-TIMEZONE:{tz_id}",
        # VTIMEZONE component for America/New_York
        "BEGIN:VTIMEZONE",
        f"TZID:{tz_id}",
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:-0500",
        "TZOFFSETTO:-0400",
        "TZNAME:EDT",
        "DTSTART:19700308T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:-0400",
        "TZOFFSETTO:-0500",
        "TZNAME:EST",
        "DTSTART:19701101T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]

    for s in schedules:
        job = s.job
        if not job:
            continue

        # Determine start and end times
        if s.start_time:
            dtstart = datetime.combine(s.scheduled_date, s.start_time)
        else:
            dtstart = datetime.combine(s.scheduled_date, time(8, 0))  # Default 8am

        if s.end_time:
            dtend = datetime.combine(s.scheduled_date, s.end_time)
        elif s.estimated_duration:
            dtend = dtstart + timedelta(hours=s.estimated_duration)
        else:
            dtend = dtstart + timedelta(hours=1)  # Default 1 hour

        # Extract street name for summary
        street_name = ""
        if job.address:
            # Extract street name from address (portion before first comma, without house number)
            street_part = job.address.split(',')[0].strip()
            # Remove leading house number (digits, optional letter suffix)
            street_name = re.sub(r'^\d+[A-Za-z]?\s+', '', street_part) or street_part
        elif job.is_parcel_job and job.parcel_data:
            # Get street_name from parcel_data for parcel jobs
            # Prefer street_name, fall back to formatted_address (for older jobs)
            raw_response = job.parcel_data.get('raw_response', {})
            street_name = raw_response.get('street_name') or raw_response.get('formatted_address', '')
            # Don't use "No Address Available" as street name
            if street_name == 'No Address Available':
                street_name = ''

        # Build summary with job number and street name
        if street_name:
            summary = escape_ics_text(f"{job.job_number} - {street_name}")
        else:
            summary = escape_ics_text(f"{job.job_number} - {job.client}")

        # Location: prefer address, fallback to coordinates
        if job.address:
            location = escape_ics_text(job.address)
        elif job.lat and job.long:
            location = f"{job.lat},{job.long}"
        else:
            location = ""

        # Build description with notes and links
        description_parts = []
        if job.status:
            description_parts.append(f"Status: {job.status}")
        if s.estimated_duration:
            description_parts.append(f"Est. Duration: {s.estimated_duration}h")
        if job.notes:
            description_parts.append(f"\\n{job.notes}")

        # Add job links
        job_links = job.links or []
        if job_links:
            description_parts.append("\\nLinks:")
            for link in job_links:
                display_name = link.get("display_name", "Link")
                url = link.get("url", "")
                if url:
                    description_parts.append(f"- {display_name}: {url}")

        description = escape_ics_text("\\n".join(description_parts))

        # Generate unique ID
        uid = f"schedule-{s.id}@epicmap.local"

        event_lines = [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
            f"DTSTART;TZID={tz_id}:{dtstart.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND;TZID={tz_id}:{dtend.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{summary}",
            f"LOCATION:{location}",
            f"DESCRIPTION:{description}",
        ]

        # Add CATEGORIES for Outlook color coding
        if job.status:
            event_lines.append(f"CATEGORIES:{escape_ics_text(job.status)}")

        event_lines.append("END:VEVENT")
        lines.extend(event_lines)

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


@api_bp.route("/schedules/calendar.ics", methods=["GET"])
def export_ics():
    """
    GET /api/schedules/calendar.ics - Export schedules as iCal feed.
    Public endpoint for calendar subscription.

    Query params:
        - days: number of days to include (default 90, max 365)
        - start_date: custom start date (default today)
        - tags: comma-separated tag IDs to filter by (OR logic)

    Example URLs:
        /api/schedules/calendar.ics
        /api/schedules/calendar.ics?tags=1,2,3
        /api/schedules/calendar.ics?days=30&tags=5
    """
    days = request.args.get("days", 90, type=int)
    days = min(max(days, 1), 365)

    start_date_str = request.args.get("start_date")
    if start_date_str:
        start = parse_date(start_date_str) or date.today()
    else:
        start = date.today()

    end = start + timedelta(days=days)

    # Build base query
    query = (
        Schedule.query
        .join(Job)
        .filter(Job.deleted_at.is_(None))
        .filter(Schedule.scheduled_date >= start)
        .filter(Schedule.scheduled_date <= end)
    )

    # Parse and apply tag filter
    tags_param = request.args.get("tags", "")
    tag_ids = []
    tag_names = []

    if tags_param:
        try:
            tag_ids = [int(t.strip()) for t in tags_param.split(",") if t.strip()]
        except ValueError:
            # Invalid tag IDs provided
            pass

        if tag_ids:
            # Filter schedules where job has any of the specified tags (OR logic)
            query = query.join(job_tags, Job.id == job_tags.c.job_id)
            query = query.filter(job_tags.c.tag_id.in_(tag_ids))
            # Use distinct to avoid duplicates when job has multiple matching tags
            query = query.distinct()

            # Fetch tag names for calendar title
            tags = Tag.query.filter(Tag.id.in_(tag_ids)).all()
            tag_names = [t.name for t in tags]

    schedules = query.order_by(Schedule.scheduled_date, Schedule.start_time).all()

    # Build calendar name
    if tag_names:
        calendar_name = f"Epic Map Schedule ({', '.join(tag_names)})"
    else:
        calendar_name = "Epic Map Schedule"

    ics_content = generate_ics(schedules, calendar_name=calendar_name)

    response = make_response(ics_content)
    response.headers["Content-Type"] = "text/calendar; charset=utf-8"
    response.headers["Content-Disposition"] = "attachment; filename=epic-schedule.ics"
    return response
