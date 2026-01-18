from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from sqlalchemy import or_
import logging

db = SQLAlchemy()
logger = logging.getLogger(__name__)


# Association table for many-to-many relation between jobs and tags
job_tags = db.Table(
    "job_tags",
    db.Column(
        "job_id",
        db.Integer,
        db.ForeignKey("jobs.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "tag_id",
        db.Integer,
        db.ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Job(db.Model):
    __tablename__ = "jobs"

    # Existing fields
    id = db.Column(db.Integer, primary_key=True)
    job_number = db.Column(db.String(50), unique=True, nullable=False)
    client = db.Column(db.String(100), nullable=False)
    address = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(100))
    county = db.Column(db.String(50))
    notes = db.Column(db.Text)

    # Coordinates
    lat = db.Column(db.String(20))
    long = db.Column(db.String(20))

    # Links
    prop_appr_link = db.Column(db.String(500))
    plat_link = db.Column(db.String(500))
    fema_link = db.Column(db.String(500))
    document_url = db.Column(db.String(500))

    # Dynamic links - list of {url, display_name} objects
    links = db.Column(db.JSON, default=list)

    # Tracking fields
    visited = db.Column(db.Integer, default=0)
    total_time_spent = db.Column(db.Float, default=0.0)
    # Remove tags field - it's causing database type mismatch
    # tags = db.Column(db.JSON, default=list)

    # Parcel geocoding fields
    is_parcel_job = db.Column(db.Boolean, default=False)
    parcel_data = db.Column(db.JSON, nullable=True)
    parcel_geometry = db.Column(db.JSON, nullable=True)  # Cached boundary rings

    # Timestamps
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    due_date = db.Column(db.Date, nullable=True)

    # Foreign keys (must be defined before relationships)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    deleted_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    # Soft deletion fields
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # NEW: Enhanced deletion field
    original_job_number = db.Column(db.String(50), nullable=True)

    # Relationships
    field_work = db.relationship(
        "FieldWork", backref="job", lazy=True, cascade="all, delete-orphan"
    )
    tags = db.relationship(
        "Tag",
        secondary=job_tags,
        backref=db.backref("jobs", lazy="dynamic"),
        lazy="joined",
    )
    created_by = db.relationship(
        "User", foreign_keys=[created_by_id], backref="created_jobs"
    )
    deleted_by = db.relationship(
        "User", foreign_keys=[deleted_by_id], backref="deleted_jobs"
    )

    # =============================================================================
    # ENHANCED SOFT DELETE METHODS
    # =============================================================================

    def soft_delete(self):
        """
        Enhanced soft delete with timestamped job number
        Example: "25-1215" becomes "25-1215_DEL_20250128"
        """
        if self.deleted_at:
            # Already deleted, don't modify
            return

        # Store original job number for restoration
        self.original_job_number = self.job_number

        # Create timestamped job number (date only for shorter format)
        date_stamp = datetime.now().strftime("%Y%m%d")
        self.job_number = f"{self.job_number}_DEL_{date_stamp}"

        # Set deletion timestamp
        self.deleted_at = datetime.now(timezone.utc)

        logger.info(f"Soft deleted job: {self.original_job_number} → {self.job_number}")

    def restore(self):
        """
        Restore deleted job to original job number
        Validates that original job number is available before restoring
        """
        if not self.deleted_at:
            raise ValueError("Job is not deleted")

        if not self.original_job_number:
            raise ValueError("No original job number stored")

        # Check if original job number is already taken by an active job
        existing_job = (
            Job.active().filter_by(job_number=self.original_job_number).first()
        )
        if existing_job:
            raise ValueError(
                f"Job number '{self.original_job_number}' is already in use"
            )

        # Restore original job number
        restored_number = self.original_job_number
        self.job_number = self.original_job_number

        # Clear deletion fields
        self.deleted_at = None
        self.deleted_by_id = None
        self.original_job_number = None

        logger.info(f"Restored job: {restored_number}")
        return restored_number

    def is_deleted(self):
        """Check if job is currently deleted"""
        return self.deleted_at is not None

    def get_display_job_number(self):
        """Get the job number to display to users (original if deleted)"""
        return self.original_job_number if self.is_deleted() else self.job_number

    # =============================================================================
    # QUERY METHODS - PROPERLY FIXED SQLALCHEMY SYNTAX
    # =============================================================================

    @classmethod
    def active(cls):
        """Get query for active (non-deleted) jobs"""
        return cls.query.filter(cls.deleted_at.is_(None))  # type: ignore

    @classmethod
    def deleted(cls):
        """Get query for deleted jobs"""
        return cls.query.filter(cls.deleted_at.isnot(None))  # type: ignore

    @classmethod
    def find_by_number(cls, job_number, include_deleted=False):
        """
        Find job by job number or original job number

        Args:
            job_number: Job number to search for
            include_deleted: Whether to include deleted jobs in search
        """
        query = cls.query.filter(
            or_(cls.job_number == job_number, cls.original_job_number == job_number)
        )

        if not include_deleted:
            query = query.filter(cls.deleted_at.is_(None))  # type: ignore

        return query.first()

    # =============================================================================
    # SERIALIZATION
    # =============================================================================

    def to_dict(self):
        """Convert job to dictionary with enhanced deleted job info (optimized)"""
        # Cache is_deleted check to avoid multiple calls
        is_deleted = self.is_deleted()
        display_job_number = self.original_job_number if is_deleted else self.job_number

        # Optimize tag serialization - only serialize if tags are loaded
        tags = getattr(self, "tags", [])
        tags_dict = [tag.to_dict() for tag in tags] if tags else []

        # Cache datetime formatting
        created_at_iso = self.created_at.isoformat() if self.created_at else None
        deleted_at_iso = self.deleted_at.isoformat() if self.deleted_at else None
        due_date_iso = self.due_date.isoformat() if self.due_date else None

        return {
            "id": self.id,
            "job_number": self.job_number,
            "original_job_number": self.original_job_number,
            "display_job_number": display_job_number,
            "client": self.client,
            "address": self.address,
            "status": self.status,
            "county": self.county,
            "notes": self.notes,
            "lat": self.lat,
            "latitude": self.lat,  # Keep for backward compatibility
            "long": self.long,
            "longitude": self.long,  # Keep for backward compatibility
            "prop_appr_link": self.prop_appr_link,
            "plat_link": self.plat_link,
            "fema_link": self.fema_link,
            "document_url": self.document_url,
            "visited": self.visited,
            "total_time_spent": self.total_time_spent,
            "is_parcel_job": self.is_parcel_job,
            "parcel_data": self.parcel_data,
            "parcel_geometry": self.parcel_geometry,
            "links": self.links or [],
            "created_at": created_at_iso,
            "deleted_at": deleted_at_iso,
            "due_date": due_date_iso,
            "deleted_by_id": self.deleted_by_id,
            "created_by_id": self.created_by_id,
            "is_deleted": is_deleted,
            "tags": tags_dict,
        }

    def __repr__(self):
        status = " [DELETED]" if self.is_deleted() else ""
        display_number = self.get_display_job_number()
        return f"<Job {display_number}: {self.client}{status}>"


# =============================================================================
# OTHER MODEL CLASSES (unchanged)
# =============================================================================


class FieldWork(db.Model):
    __tablename__ = "fieldwork"

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    work_date = db.Column(db.Date, nullable=False)
    total_time = db.Column(db.Float, nullable=False)
    crew = db.Column(db.String(100))
    drone_card = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "job_id": self.job_id,
            "work_date": self.work_date.isoformat() if self.work_date else None,
            "total_time": self.total_time,
            "crew": self.crew,
            "drone_card": self.drone_card,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="user")
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_active = db.Column(db.DateTime(timezone=True))
    last_ip = db.Column(db.String(45))

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "name": self.name,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_active": self.last_active.isoformat() if self.last_active else None,
            "last_ip": self.last_ip,
        }


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    color = db.Column(db.String(7), default="#007bff")
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """
        Serialize the Tag model to a plain dictionary for external use.

        Returns:
            dict: Mapping with keys:
                - "id" (int): Tag primary key.
                - "name" (str): Tag name.
                - "color" (str): Hex color string.
                - "created_at" (str or None): ISO 8601 timestamp for creation or `None` if unavailable.
        """
        # Cache datetime formatting
        created_at_iso = self.created_at.isoformat() if self.created_at else None
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "created_at": created_at_iso,
        }


class POI(db.Model):
    """Point of Interest - permanent map markers like Office, warehouse, etc."""

    __tablename__ = "pois"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.Text)
    lat = db.Column(db.Numeric(10, 7), nullable=False)
    lng = db.Column(db.Numeric(10, 7), nullable=False)
    icon = db.Column(db.String(50), default="bi-geo-alt")
    color = db.Column(db.String(7), default="#3b82f6")
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """
        Return a serializable dictionary representation of the POI.

        Returns:
            dict: Mapping with keys:
                - id (int): Primary key of the POI.
                - name (str): POI name.
                - address (str | None): Address text or None if absent.
                - lat (float | None): Latitude as float or None if absent.
                - lng (float | None): Longitude as float or None if absent.
                - icon (str): Icon identifier.
                - color (str): Hex color string.
                - created_at (str | None): RFC 3339 / ISO 8601 timestamp string or None if absent.
        """
        return {
            "id": self.id,
            "name": self.name,
            "address": self.address,
            "lat": float(self.lat) if self.lat else None,
            "lng": float(self.lng) if self.lng else None,
            "icon": self.icon,
            "color": self.color,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        """
        Return a concise developer-facing representation of the POI.

        Returns:
            A string in the format "<POI {name}>" where {name} is the POI's name.
        """
        return f"<POI {self.name}>"


class Schedule(db.Model):
    """
    Represents a scheduled job visit for a specific date and time block.
    A job can have multiple scheduled visits (return visits allowed).
    """

    __tablename__ = "schedules"

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(
        db.Integer, db.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    scheduled_date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=True)  # Time block start
    end_time = db.Column(db.Time, nullable=True)  # Time block end
    estimated_duration = db.Column(db.Float, nullable=True)  # Hours
    route_order = db.Column(db.Integer, nullable=True)  # Position in day's route
    notes = db.Column(db.Text)
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_at = db.Column(
        db.DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    job = db.relationship(
        "Job",
        backref=db.backref("schedules", lazy="dynamic", cascade="all, delete-orphan"),
    )
    created_by = db.relationship("User", backref="created_schedules")

    def to_dict(self):
        """Serialize Schedule to dictionary."""
        return {
            "id": self.id,
            "job_id": self.job_id,
            "job_number": self.job.job_number if self.job else None,
            "client": self.job.client if self.job else None,
            "address": self.job.address if self.job else None,
            "lat": self.job.lat if self.job else None,
            "lng": self.job.long if self.job else None,
            "scheduled_date": self.scheduled_date.isoformat() if self.scheduled_date else None,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "estimated_duration": self.estimated_duration,
            "route_order": self.route_order,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by_id": self.created_by_id,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        job_num = self.job.job_number if self.job else "?"
        return f"<Schedule {job_num} on {self.scheduled_date}>"

