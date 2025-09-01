"""Fix accidental tags/fieldwork schema merge

Revision ID: fix_tags_fieldwork_mixup_20250831
Revises: create_job_tags_20250831
Create Date: 2025-08-31 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "fix_tags_fw_split_20250831"
down_revision = "create_job_tags_20250831"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    def has_table(name: str) -> bool:
        try:
            return name in insp.get_table_names()
        except Exception:
            return False

    def has_column(table: str, col: str) -> bool:
        try:
            return any(c["name"] == col for c in insp.get_columns(table))
        except Exception:
            return False

    tags_has_fieldwork_cols = has_table("tags") and has_column("tags", "job_id")
    fieldwork_exists = has_table("fieldwork")

    # If fieldwork table is missing and tags contains fieldwork columns,
    # split tags into proper tags and fieldwork tables.
    if tags_has_fieldwork_cols and not fieldwork_exists:
        # 1) Rename current tags -> backup
        op.rename_table("tags", "tags_fieldwork_merge_tmp")

        # 2) Recreate clean tags table
        op.create_table(
            "tags",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=50), nullable=False),
            sa.Column("color", sa.String(length=7), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("name", name="uq_tags_name"),
        )

        # 3) Recreate fieldwork table
        op.create_table(
            "fieldwork",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
            sa.Column("work_date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("total_time", sa.Float(), nullable=False),
            sa.Column("crew", sa.String(length=100), nullable=True),
            sa.Column("drone_card", sa.String(length=100), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

        # 4) Copy back data from backup table
        # Tags rows have non-null name; fieldwork rows have non-null job_id
        op.execute(
            sa.text(
                """
                INSERT INTO tags (id, name, color, created_at)
                SELECT id, name, COALESCE(color, '#007bff'), created_at
                FROM tags_fieldwork_merge_tmp
                WHERE name IS NOT NULL
                """
            )
        )

        op.execute(
            sa.text(
                """
                INSERT INTO fieldwork (id, job_id, work_date, start_time, end_time, total_time, crew, drone_card, notes, created_at)
                SELECT id, job_id, work_date, start_time, end_time, COALESCE(total_time, 0), crew, drone_card, notes, created_at
                FROM tags_fieldwork_merge_tmp
                WHERE job_id IS NOT NULL
                """
            )
        )

        # 5) Re-point job_tags.tag_id FK to the new tags table
        try:
            op.drop_constraint("job_tags_tag_id_fkey", "job_tags", type_="foreignkey")
        except Exception:
            pass
        try:
            op.create_foreign_key(
                "job_tags_tag_id_fkey",
                "job_tags",
                "tags",
                ["tag_id"],
                ["id"],
                ondelete="CASCADE",
            )
        except Exception:
            pass

        # 6) Drop backup table
        op.drop_table("tags_fieldwork_merge_tmp")

    # If fieldwork exists but tags still has fieldwork columns, rebuild tags only.
    elif tags_has_fieldwork_cols and fieldwork_exists:
        op.rename_table("tags", "tags_fieldwork_merge_tmp")
        op.create_table(
            "tags",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=50), nullable=False),
            sa.Column("color", sa.String(length=7), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("name", name="uq_tags_name"),
        )

        op.execute(
            sa.text(
                """
                INSERT INTO tags (id, name, color, created_at)
                SELECT id, name, COALESCE(color, '#007bff'), created_at
                FROM tags_fieldwork_merge_tmp
                WHERE name IS NOT NULL
                """
            )
        )

        # Re-point FK to new tags table
        try:
            op.drop_constraint("job_tags_tag_id_fkey", "job_tags", type_="foreignkey")
        except Exception:
            pass
        try:
            op.create_foreign_key(
                "job_tags_tag_id_fkey",
                "job_tags",
                "tags",
                ["tag_id"],
                ["id"],
                ondelete="CASCADE",
            )
        except Exception:
            pass

        op.drop_table("tags_fieldwork_merge_tmp")


def downgrade():
    # Best-effort: leave clean separation; recreate merge is not desirable.
    pass
