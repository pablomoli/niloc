"""Fix datetime timezone columns

Revision ID: 46fabbde34c3
Revises: add_user_username_index_20251118
Create Date: 2025-11-29 01:39:38.942931

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '46fabbde34c3'
down_revision = 'add_user_username_index_20251118'
branch_labels = None
depends_on = None


def upgrade():
    # Manual edit: Only include timezone changes, exclude schema drift changes
    # Convert FieldWork.created_at to timezone-aware
    with op.batch_alter_table('fieldwork', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)

    # Convert Jobs.created_at and Jobs.deleted_at to timezone-aware
    with op.batch_alter_table('jobs', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)
        batch_op.alter_column('deleted_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)

    # Convert Tags.created_at to timezone-aware
    with op.batch_alter_table('tags', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)

    # Convert Users.created_at and Users.last_login to timezone-aware
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)
        batch_op.alter_column('last_login',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)


def downgrade():
    # Manual edit: Revert timezone changes only
    # Revert Users.created_at and Users.last_login
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('last_login',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)
        batch_op.alter_column('created_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)

    # Revert Tags.created_at
    with op.batch_alter_table('tags', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)

    # Revert Jobs.created_at and Jobs.deleted_at
    with op.batch_alter_table('jobs', schema=None) as batch_op:
        batch_op.alter_column('deleted_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)
        batch_op.alter_column('created_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)

    # Revert FieldWork.created_at
    with op.batch_alter_table('fieldwork', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)
