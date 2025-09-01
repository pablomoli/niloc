"""Create job_tags association table for Job <-> Tag

Revision ID: create_job_tags_20250831
Revises: align_tags_schema_20250831
Create Date: 2025-08-31 12:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "create_job_tags_20250831"
down_revision = "align_tags_schema_20250831"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "job_tags",
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, nullable=False),
    )


def downgrade():
    op.drop_table("job_tags")

