"""create schedules table

Revision ID: a1b2c3d4e5f6
Revises: 3a5a6d962e5d
Create Date: 2026-01-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '3a5a6d962e5d'
branch_labels = None
depends_on = None


def upgrade():
    # Create schedules table
    op.create_table(
        'schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=True),
        sa.Column('end_time', sa.Time(), nullable=True),
        sa.Column('estimated_duration', sa.Float(), nullable=True),
        sa.Column('route_order', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('end_time IS NULL OR end_time > start_time', name='valid_time_range')
    )

    # Create indexes for efficient queries
    op.create_index('idx_schedules_date', 'schedules', ['scheduled_date'])
    op.create_index('idx_schedules_job', 'schedules', ['job_id'])
    op.create_index('idx_schedules_date_order', 'schedules', ['scheduled_date', 'route_order'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_schedules_date_order', table_name='schedules')
    op.drop_index('idx_schedules_job', table_name='schedules')
    op.drop_index('idx_schedules_date', table_name='schedules')

    # Drop table
    op.drop_table('schedules')
