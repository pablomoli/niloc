"""Add indexes on job_tags association table for faster tag lookups

Revision ID: add_job_tags_indexes
Revises: add_performance_indexes
Create Date: 2025-01-28 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "add_job_tags_indexes"
down_revision = "add_performance_indexes"
branch_labels = None
depends_on = None


def upgrade():
    """Add indexes on job_tags association table for faster tag lookups"""
    
    print("Adding indexes on job_tags association table...")
    
    # Index on job_id for faster job->tags lookups
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_job_tags_job_id 
        ON job_tags(job_id);
        """)
    )
    
    # Index on tag_id for faster tag->jobs lookups
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_job_tags_tag_id 
        ON job_tags(tag_id);
        """)
    )
    
    # Composite index for faster lookups when filtering by both
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_job_tags_composite 
        ON job_tags(job_id, tag_id);
        """)
    )
    
    print("✅ job_tags indexes created successfully!")


def downgrade():
    """Remove job_tags indexes"""
    
    print("Removing job_tags indexes...")
    
    indexes_to_drop = [
        "idx_job_tags_job_id",
        "idx_job_tags_tag_id",
        "idx_job_tags_composite",
    ]
    
    for index_name in indexes_to_drop:
        op.execute(text(f"DROP INDEX IF EXISTS {index_name};"))
    
    print("✅ job_tags indexes removed successfully!")

