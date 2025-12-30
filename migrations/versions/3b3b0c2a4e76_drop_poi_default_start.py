"""Drop POI is_default_start flag

Revision ID: 3b3b0c2a4e76
Revises: f453b17a55b1
Create Date: 2025-12-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3b3b0c2a4e76"
down_revision = "f453b17a55b1"
branch_labels = None
depends_on = None


def upgrade():
    """
    Drop the `is_default_start` column from the `pois` table.
    
    Removes the obsolete boolean `is_default_start` field from the pois table schema.
    """
    with op.batch_alter_table("pois") as batch_op:
        batch_op.drop_column("is_default_start")


def downgrade():
    """
    Recreates the "is_default_start" column on the "pois" table as a nullable Boolean.
    
    Adds a column named "is_default_start" of SQLAlchemy Boolean type to the "pois" table and allows NULL values; intended as the migration downgrade that reverses the column drop.
    """
    with op.batch_alter_table("pois") as batch_op:
        batch_op.add_column(sa.Column("is_default_start", sa.Boolean(), nullable=True))