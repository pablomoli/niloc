"""Add index on users.username for faster lookups

Revision ID: add_user_username_index_20251118
Revises: update_status_names_20250120
Create Date: 2025-11-18 00:00:00.000000

This migration adds an index on the users.username column to improve
performance of user lookup queries, particularly for the /api/users endpoint.
"""

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = "add_user_username_index_20251118"
down_revision = "update_status_names_20250120"
branch_labels = None
depends_on = None


def upgrade():
    """Add index on users.username"""
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_users_username 
        ON users(username);
        """)
    )
    print("✅ Index on users.username created successfully!")


def downgrade():
    """Remove index on users.username"""
    op.execute(text("DROP INDEX IF EXISTS idx_users_username;"))
    print("✅ Index on users.username removed successfully!")

