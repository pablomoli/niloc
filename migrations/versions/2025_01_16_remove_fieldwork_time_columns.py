"""Remove unused start_time and end_time columns from fieldwork table

Revision ID: remove_fw_time_columns_20250116
Revises: allow_null_address_20250911
Create Date: 2025-01-16 00:00:00.000000

This migration removes the start_time and end_time columns from the fieldwork
table since we now only use total_time (hours:minutes format).
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "remove_fw_time_columns_20250116"
down_revision = "add_job_tags_indexes"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("fieldwork") as batch_op:
        batch_op.drop_column("start_time")
        batch_op.drop_column("end_time")


def downgrade():
    # Re-add columns with nullable=True for backward compatibility
    with op.batch_alter_table("fieldwork") as batch_op:
        batch_op.add_column(sa.Column("start_time", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("end_time", sa.Time(), nullable=True))

