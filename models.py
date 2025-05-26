from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import ARRAY
from datetime import datetime, timezone

db = SQLAlchemy()

related_jobs_table = db.Table(
    "related_jobs",
    db.Column("job_id", db.Integer, db.ForeignKey("jobs.id"), primary_key=True),
    db.Column("related_id", db.Integer, db.ForeignKey("jobs.id"), primary_key=True),
)


class Job(db.Model):
    __tablename__ = "jobs"
    id = db.Column(db.Integer, primary_key=True)

    job_number = db.Column(db.String(100), unique=True, nullable=False)
    client = db.Column(db.String(200), nullable=False)
    address = db.Column(db.String(200), nullable=False)
    county = db.Column(db.String(100))
    status = db.Column(db.String(100))

    lat = db.Column(db.String(100))
    long = db.Column(db.String(100))

    prop_appr_link = db.Column(db.String(300))
    plat_link = db.Column(db.String(300))
    fema_link = db.Column(db.String(300))

    notes = db.Column(db.Text)
    document_url = db.Column(db.Text)

    visited = db.Column(db.Integer, default=0)
    total_time_spent = db.Column(db.Float, default=0.0)

    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_by = db.relationship(
        "User", foreign_keys=[created_by_id], backref="jobs_created"
    )

    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    deleted_by = db.relationship(
        "User", foreign_keys=[deleted_by_id], backref="jobs_deleted"
    )

    tags = db.Column(ARRAY(db.Integer), default=[])

    related = db.relationship(
        "Job",
        secondary=related_jobs_table,
        primaryjoin=id == related_jobs_table.c.job_id,
        secondaryjoin=id == related_jobs_table.c.related_id,
        backref="related_to",
    )

    field_work = db.relationship("FieldWork", back_populates="job", lazy=True)

    def to_dict(self, include_fieldwork=False):
        """
        Convert job to dictionary with consistent field names

        Args:
            include_fieldwork (bool): Whether to include fieldwork entries

        Returns:
            dict: Job data with standardized field names
        """
        # Convert coordinates to float if they exist, otherwise None
        latitude = float(self.lat) if self.lat else None
        longitude = float(self.long) if self.long else None

        job_dict = {
            "id": self.id,
            "job_number": self.job_number,
            "client": self.client,
            "address": self.address,
            "county": self.county,
            "status": self.status,
            # Consistent coordinate field names - no more duplicates!
            "latitude": latitude,
            "longitude": longitude,
            # Links
            "prop_appr_link": self.prop_appr_link,
            "plat_link": self.plat_link,
            "fema_link": self.fema_link,
            "document_url": self.document_url,
            # Content
            "notes": self.notes,
            # Metrics
            "visited": self.visited or 0,
            "total_time_spent": float(self.total_time_spent or 0),
            "tags": self.tags or [],
            # Metadata
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by.name if self.created_by else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }

        if include_fieldwork:
            try:
                # Import here to avoid circular imports
                fieldwork_entries = (
                    db.session.query(FieldWork).filter_by(job_id=self.id).all()
                )
                job_dict["fieldwork"] = [fw.to_dict() for fw in fieldwork_entries]
            except Exception as e:
                # If there's an issue loading fieldwork, just return empty list
                job_dict["fieldwork"] = []
        return job_dict

    @classmethod
    def active(cls):
        return cls.query.filter(cls.deleted_at.is_(None))

    @classmethod
    def deleted(cls):
        return cls.query.filter(cls.deleted_at._isnot(None))

    @classmethod
    def by_user(cls, user_id):
        return cls.active().filter(cls.created_by_id == user_id)


class FieldWork(db.Model):
    __tablename__ = "field_work"
    id = db.Column(db.Integer, primary_key=True)

    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    job = db.relationship("Job", back_populates="field_work", lazy=True)

    work_date = db.Column(db.Date, nullable=False)

    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    total_time = db.Column(db.Float, default=0.0)

    crew = db.Column(db.String(100))
    drone_card = db.Column(db.String(100))

    notes = db.Column(db.Text)
    document_url = db.Column(db.Text)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.compute_total_time()

    def compute_total_time(self):
        if self.start_time and self.end_time:
            start = datetime.combine(self.work_date, self.start_time)
            end = datetime.combine(self.work_date, self.end_time)
            delta = end - start
            self.total_time = round(delta.total_seconds() / 3600, 2)

    def to_dict(self):
        return {
            "id": self.id,
            "job_id": self.job.job_number if self.job else None,
            "work_date": self.work_date.isoformat() if self.work_date else None,
            "start_time": self.start_time.strftime("%H:%M")
            if self.start_time
            else None,
            "end_time": self.end_time.strftime("%H:%M") if self.end_time else None,
            "crew": self.crew,
            "drone_card": self.drone_card,
            "total_time": self.total_time,
            "notes": self.notes,
            "document_url": self.document_url,
        }


class Tag(db.Model):
    __tablename__ = "tags"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), unique=True, nullable=False)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)  # hashed
    role = db.Column(db.String(20), nullable=False)  # 'admin' or 'user'

    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    last_login = db.Column(db.DateTime)
    last_ip = db.Column(db.String(64))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "username": self.username,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "last_ip": self.last_ip,
        }
