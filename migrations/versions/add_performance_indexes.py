"""Add performance indexes for optimized queries

Revision ID: add_performance_indexes
Revises: f453b17a55b1
Create Date: 2025-01-28 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "add_performance_indexes"
down_revision = "f453b17a55b1"
branch_labels = None
depends_on = None


def upgrade():
    """Add performance indexes for optimized queries"""
    
    print("Adding performance indexes for optimized queries...")
    
    # Composite index for common filter combinations (status + county)
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_jobs_status_county 
        ON jobs(status, county) 
        WHERE deleted_at IS NULL;
        """)
    )
    
    # Index on created_at DESC for faster ordering
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_jobs_created_at_desc 
        ON jobs(created_at DESC) 
        WHERE deleted_at IS NULL;
        """)
    )
    
    # Index on original_job_number for faster restore operations
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_jobs_original_job_number 
        ON jobs(original_job_number) 
        WHERE original_job_number IS NOT NULL;
        """)
    )
    
    # Composite index for deleted jobs lookup (original_job_number + deleted_at)
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_jobs_deleted_original_lookup 
        ON jobs(original_job_number, deleted_at) 
        WHERE deleted_at IS NOT NULL;
        """)
    )
    
    print("✅ Performance indexes created successfully!")


def downgrade():
    """Remove performance indexes"""
    
    print("Removing performance indexes...")
    
    indexes_to_drop = [
        "idx_jobs_status_county",
        "idx_jobs_created_at_desc",
        "idx_jobs_original_job_number",
        "idx_jobs_deleted_original_lookup",
    ]
    
    for index_name in indexes_to_drop:
        op.execute(text(f"DROP INDEX IF EXISTS {index_name};"))
    
    print("✅ Performance indexes removed successfully!")

