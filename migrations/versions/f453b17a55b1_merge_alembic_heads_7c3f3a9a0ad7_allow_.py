"""Merge Alembic heads: 7c3f3a9a0ad7 +
  allow_null_address_20250911

Revision ID: f453b17a55b1
Revises: 7c3f3a9a0ad7, allow_null_address_20250911
Create Date: 2025-09-10 23:24:43.214887

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f453b17a55b1'
down_revision = ('7c3f3a9a0ad7', 'allow_null_address_20250911')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
