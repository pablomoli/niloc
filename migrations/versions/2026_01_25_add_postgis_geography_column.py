"""add postgis geography column to jobs

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-01-25 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6g7h8i9'
down_revision = 'c3d4e5f6g7h8'
branch_labels = None
depends_on = None


def upgrade():
    # Enable PostGIS extension (idempotent)
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis')

    # Add geography column to jobs table
    # Geography type uses SRID 4326 (WGS84) by default and measures in meters
    op.execute('''
        ALTER TABLE jobs
        ADD COLUMN geog geography(POINT, 4326)
    ''')

    # Populate geog from existing lat/long values
    # ST_MakePoint takes (longitude, latitude) order
    # Only update rows where both lat and long are valid numeric values
    op.execute('''
        UPDATE jobs
        SET geog = ST_SetSRID(
            ST_MakePoint(
                CAST(long AS double precision),
                CAST(lat AS double precision)
            ),
            4326
        )::geography
        WHERE lat IS NOT NULL
          AND long IS NOT NULL
          AND lat ~ '^-?[0-9]+\.?[0-9]*$'
          AND long ~ '^-?[0-9]+\.?[0-9]*$'
    ''')

    # Create GIST spatial index for efficient proximity queries
    op.execute('''
        CREATE INDEX idx_jobs_geog
        ON jobs
        USING GIST (geog)
    ''')


def downgrade():
    # Drop the spatial index
    op.execute('DROP INDEX IF EXISTS idx_jobs_geog')

    # Drop the geography column
    op.execute('ALTER TABLE jobs DROP COLUMN IF EXISTS geog')

    # Note: We don't drop the PostGIS extension as other tables may depend on it
