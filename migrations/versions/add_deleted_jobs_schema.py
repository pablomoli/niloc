"""Add deleted jobs schema updates

Revision ID: add_deleted_jobs_schema
Revises: (previous revision)
Create Date: 2025-01-28 17:30:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "add_deleted_jobs_schema"
down_revision = "5f164e9d223b"
branch_labels = None
depends_on = None


def upgrade():
    """Add schema changes for enhanced deleted jobs management"""

    print("Adding deleted jobs schema enhancements...")

    # Add original_job_number column to store job number before deletion
    op.add_column(
        "jobs", sa.Column("original_job_number", sa.String(50), nullable=True)
    )

    # Create indexes for deleted job queries
    print("Creating indexes for deleted job queries...")

    # Index for looking up deleted jobs by original job number
    op.create_index(
        "idx_jobs_deleted_lookup", "jobs", ["original_job_number", "deleted_at"]
    )

    # Partial index for deleted jobs only (more efficient)
    op.execute(
        text("""
        CREATE INDEX idx_jobs_deleted_at 
        ON jobs(deleted_at) 
        WHERE deleted_at IS NOT NULL
    """)
    )

    # Index for active jobs lookup (complement to deleted index)
    op.execute(
        text("""
        CREATE INDEX idx_jobs_active_lookup 
        ON jobs(job_number) 
        WHERE deleted_at IS NULL
    """)
    )

    print("✅ Deleted jobs schema migration completed successfully!")


def downgrade():
    """Remove deleted jobs schema changes"""

    print("Removing deleted jobs schema enhancements...")

    # Drop indexes
    op.drop_index("idx_jobs_deleted_lookup", table_name="jobs")
    op.execute(text("DROP INDEX IF EXISTS idx_jobs_deleted_at"))
    op.execute(text("DROP INDEX IF EXISTS idx_jobs_active_lookup"))

    # Drop column
    op.drop_column("jobs", "original_job_number")

    print("✅ Deleted jobs schema rollback completed!")
