"""Align tags schema with models and drop jobs.tags

Revision ID: align_tags_schema_20250831
Revises: d0694454d94b_add_original_job_number_and_deleted_job_
Create Date: 2025-08-31 12:40:00.000000

This migration normalizes the `tags` table to match models.py
(`name`, `color`, `created_at`) and removes the legacy `jobs.tags`
column which is currently unused by the application.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "align_tags_schema_20250831"
down_revision = "d0694454d94b"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    try:
        cols = [c["name"] for c in inspector.get_columns(table_name)]
        return column_name in cols
    except Exception:
        return False


def _drop_uc_if_exists(inspector, table: str, column: str):
    try:
        for uc in inspector.get_unique_constraints(table):
            if uc.get("column_names") == [column]:
                op.drop_constraint(uc["name"], table, type_="unique")
    except Exception:
        # Be permissive — continue if unable to introspect
        pass


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1) Normalize tags table columns
    if _has_column(insp, "tags", "title") and not _has_column(insp, "tags", "name"):
        with op.batch_alter_table("tags") as batch_op:
            batch_op.add_column(sa.Column("name", sa.String(length=50), nullable=True))
        # Backfill name from title
        op.execute(sa.text("UPDATE tags SET name = title WHERE name IS NULL"))
        # Ensure uniqueness on name; drop title unique if present
        _drop_uc_if_exists(insp, "tags", "title")
        with op.batch_alter_table("tags") as batch_op:
            batch_op.create_unique_constraint("uq_tags_name", ["name"])
            batch_op.alter_column("name", nullable=False)

        # Add color and created_at if missing
        with op.batch_alter_table("tags") as batch_op:
            if not _has_column(insp, "tags", "color"):
                batch_op.add_column(sa.Column("color", sa.String(length=7), nullable=True))
            if not _has_column(insp, "tags", "created_at"):
                batch_op.add_column(sa.Column("created_at", sa.DateTime(), nullable=True))

        # Finally drop legacy title column
        with op.batch_alter_table("tags") as batch_op:
            batch_op.drop_column("title")
    else:
        # Table might already be close to desired; ensure columns exist
        with op.batch_alter_table("tags") as batch_op:
            if not _has_column(insp, "tags", "name"):
                batch_op.add_column(sa.Column("name", sa.String(length=50), nullable=False))
                batch_op.create_unique_constraint("uq_tags_name", ["name"])
            if not _has_column(insp, "tags", "color"):
                batch_op.add_column(sa.Column("color", sa.String(length=7), nullable=True))
            if not _has_column(insp, "tags", "created_at"):
                batch_op.add_column(sa.Column("created_at", sa.DateTime(), nullable=True))

    # 2) Drop legacy jobs.tags column (unused by app)
    if _has_column(insp, "jobs", "tags"):
        with op.batch_alter_table("jobs") as batch_op:
            batch_op.drop_column("tags")


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Re-create jobs.tags as an integer array (best-effort)
    if not _has_column(insp, "jobs", "tags"):
        with op.batch_alter_table("jobs") as batch_op:
            batch_op.add_column(sa.Column("tags", sa.ARRAY(sa.Integer()), nullable=True))

    # Restore legacy title column on tags and drop modern fields
    with op.batch_alter_table("tags") as batch_op:
        if not _has_column(insp, "tags", "title"):
            batch_op.add_column(sa.Column("title", sa.String(length=100), nullable=True))

    # Backfill title from name if possible
    if _has_column(insp, "tags", "name"):
        op.execute(sa.text("UPDATE tags SET title = name WHERE title IS NULL"))

    # Drop modern columns/constraints
    try:
        op.drop_constraint("uq_tags_name", "tags", type_="unique")
    except Exception:
        pass
    with op.batch_alter_table("tags") as batch_op:
        if _has_column(insp, "tags", "created_at"):
            batch_op.drop_column("created_at")
        if _has_column(insp, "tags", "color"):
            batch_op.drop_column("color")
        if _has_column(insp, "tags", "name"):
            batch_op.drop_column("name")
        batch_op.alter_column("title", nullable=False)
        # Best-effort uniqueness on title
        batch_op.create_unique_constraint("tags_title_key", ["title"])
