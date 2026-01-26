"""Add POI support to schedules table

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-01-26 16:00:00.000000

This migration enables scheduling POIs (Points of Interest) alongside jobs:
1. Makes job_id nullable (schedules can now be for POIs instead of jobs)
2. Adds poi_id foreign key column
3. Re-adds notes column for schedule-specific notes
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = 'f6g7h8i9j0k1'
down_revision = 'e5f6g7h8i9j0'
branch_labels = None
depends_on = None


def upgrade():
    print("Adding POI support to schedules...")

    # 1. Make job_id nullable
    op.alter_column('schedules', 'job_id',
                    existing_type=sa.Integer(),
                    nullable=True)

    # 2. Add poi_id column with foreign key
    op.add_column('schedules',
                  sa.Column('poi_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_schedules_poi_id',
        'schedules', 'pois',
        ['poi_id'], ['id'],
        ondelete='CASCADE'
    )

    # 3. Add notes column for schedule-specific notes
    op.add_column('schedules',
                  sa.Column('notes', sa.Text(), nullable=True))

    # 4. Add check constraint: either job_id or poi_id must be set (but not both)
    # Note: Postgres doesn't support CHECK constraints directly in Alembic,
    # so we use raw SQL
    op.execute(text("""
        ALTER TABLE schedules
        ADD CONSTRAINT chk_schedules_job_or_poi
        CHECK (
            (job_id IS NOT NULL AND poi_id IS NULL) OR
            (job_id IS NULL AND poi_id IS NOT NULL)
        )
    """))

    print("POI support added to schedules table")


def downgrade():
    print("Removing POI support from schedules...")

    # Remove check constraint
    op.execute(text("ALTER TABLE schedules DROP CONSTRAINT IF EXISTS chk_schedules_job_or_poi"))

    # Remove notes column
    op.drop_column('schedules', 'notes')

    # Remove poi_id foreign key and column
    op.drop_constraint('fk_schedules_poi_id', 'schedules', type_='foreignkey')
    op.drop_column('schedules', 'poi_id')

    # Make job_id non-nullable (will fail if any POI-only schedules exist)
    op.alter_column('schedules', 'job_id',
                    existing_type=sa.Integer(),
                    nullable=False)

    print("POI support removed from schedules table")
