"""Allow NULL addresses to support parcel jobs without addresses

Revision ID: allow_null_address_20250911
Revises: align_tags_schema_20250831
Create Date: 2025-09-11 00:00:00.000000

This migration updates the `jobs.address` column to be nullable so that
jobs created from parcel lookups can omit an address.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "allow_null_address_20250911"
down_revision = "fix_tags_fw_split_20250831"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.alter_column(
            "address",
            existing_type=sa.VARCHAR(length=200),
            nullable=True,
        )


def downgrade():
    # Best-effort: set empty addresses to placeholder before making non-nullable
    op.execute(sa.text("UPDATE jobs SET address = 'No Address Available' WHERE address IS NULL"))
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.alter_column(
            "address",
            existing_type=sa.VARCHAR(length=200),
            nullable=False,
        )
