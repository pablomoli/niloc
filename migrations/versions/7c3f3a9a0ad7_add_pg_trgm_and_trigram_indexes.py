"""Add pg_trgm extension and trigram indexes for autocomplete

Revision ID: 7c3f3a9a0ad7
Revises: d0694454d94b
Create Date: 2025-09-11 00:00:00

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "7c3f3a9a0ad7"
down_revision = "d0694454d94b"
branch_labels = None
depends_on = None


def upgrade():
    # Ensure pg_trgm extension exists (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    # Create trigram GIN indexes on frequently searched fields (idempotent)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_jobs_job_number_trgm
        ON jobs USING gin (job_number gin_trgm_ops);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_jobs_client_trgm
        ON jobs USING gin (client gin_trgm_ops);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_jobs_address_trgm
        ON jobs USING gin (address gin_trgm_ops);
        """
    )


def downgrade():
    # Drop indexes if they exist (safe on downgrade)
    op.execute("DROP INDEX IF EXISTS idx_jobs_address_trgm;")
    op.execute("DROP INDEX IF EXISTS idx_jobs_client_trgm;")
    op.execute("DROP INDEX IF EXISTS idx_jobs_job_number_trgm;")

