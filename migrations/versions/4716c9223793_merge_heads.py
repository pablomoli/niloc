"""Merge heads

Revision ID: 4716c9223793
Revises: 3b3b0c2a4e76, 46fabbde34c3
Create Date: 2025-12-29 20:42:56.715265

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4716c9223793'
down_revision = ('3b3b0c2a4e76', '46fabbde34c3')
branch_labels = None
depends_on = None


def upgrade():
    """
    Mark this Alembic merge revision and perform no schema changes.
    
    This migration merges two revision heads into a single revision and intentionally contains no upgrade operations.
    """
    pass


def downgrade():
    """
    Revert the database schema changes introduced by this migration.
    
    This migration defines no schema or data changes, so calling downgrade performs no operations.
    """
    pass