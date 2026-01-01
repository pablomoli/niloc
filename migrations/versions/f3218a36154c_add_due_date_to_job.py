"""add due_date to job

Revision ID: f3218a36154c
Revises: 4716c9223793
Create Date: 2025-12-31 16:45:26.461711

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f3218a36154c'
down_revision = '4716c9223793'
branch_labels = None
depends_on = None


def upgrade():
    # Add due_date column to jobs table
    with op.batch_alter_table('jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('due_date', sa.Date(), nullable=True))


def downgrade():
    # Remove due_date column from jobs table
    with op.batch_alter_table('jobs', schema=None) as batch_op:
        batch_op.drop_column('due_date')
