from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from sqlalchemy import or_

db = SQLAlchemy()


class Job(db.Model):
    __tablename__ = "jobs"

    # Existing fields
    id = db.Column(db.Integer, primary_key=True)
    job_number = db.Column(db.String(50), unique=True, nullable=False)
    client = db.Column(db.String(100), nullable=False)
    address = db.Column(db.Text, nullable=False)
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

    # Tracking fields
    visited = db.Column(db.Integer, default=0)
    total_time_spent = db.Column(db.Float, default=0.0)
    tags = db.Column(db.JSON, default=list)

    # Timestamps
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Foreign keys (must be defined before relationships)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    deleted_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    # Soft deletion fields
    deleted_at = db.Column(db.DateTime, nullable=True)

    # NEW: Enhanced deletion field
    original_job_number = db.Column(db.String(50), nullable=True)

    # Relationships
    field_work = db.relationship(
        "FieldWork", backref="job", lazy=True, cascade="all, delete-orphan"
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

        print(f"Soft deleted job: {self.original_job_number} → {self.job_number}")

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

        print(f"Restored job: {restored_number}")
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
        """Convert job to dictionary with enhanced deleted job info"""
        return {
            "id": self.id,
            "job_number": self.job_number,
            "original_job_number": self.original_job_number,
            "display_job_number": self.get_display_job_number(),
            "client": self.client,
            "address": self.address,
            "status": self.status,
            "county": self.county,
            "notes": self.notes,
            "lat": self.lat,
            "latitude": self.lat,
            "long": self.long,
            "longitude": self.long,
            "prop_appr_link": self.prop_appr_link,
            "plat_link": self.plat_link,
            "fema_link": self.fema_link,
            "document_url": self.document_url,
            "visited": self.visited,
            "total_time_spent": self.total_time_spent,
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "deleted_by_id": self.deleted_by_id,
            "created_by_id": self.created_by_id,
            "is_deleted": self.is_deleted(),
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
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    total_time = db.Column(db.Float, nullable=False)
    crew = db.Column(db.String(100))
    drone_card = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "job_id": self.job_id,
            "work_date": self.work_date.isoformat() if self.work_date else None,
            "start_time": self.start_time.strftime("%H:%M")
            if self.start_time
            else None,
            "end_time": self.end_time.strftime("%H:%M") if self.end_time else None,
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
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = db.Column(db.DateTime)
    last_ip = db.Column(db.String(45))

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "name": self.name,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "last_ip": self.last_ip,
        }


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    color = db.Column(db.String(7), default="#007bff")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
