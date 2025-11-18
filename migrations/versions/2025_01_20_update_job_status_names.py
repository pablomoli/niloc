"""Update job status names to new naming convention

Revision ID: update_status_names_20250120
Revises: remove_fw_time_columns_20250116
Create Date: 2025-01-20 00:00:00.000000

This migration updates existing job status values in the database to match
the new naming convention:
- "Completed" → "Completed/To be Filed"
- "Needs Office Work" → "Fieldwork Complete"
- "Invoice Sent" → "Survey Complete/Invoice Sent"
- "Set Pins" → "Set/Flag Pins"
- "On Hold" → "On Hold/Pending Estimate"
- "Ongoing Site" → "Site Plan"
- "To Be Printed", "Needs Fieldwork", "Quote Available" remain unchanged
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = "update_status_names_20250120"
down_revision = "remove_fw_time_columns_20250116"
branch_labels = None
depends_on = None


# Status migration mapping (matches utils.py STATUS_MIGRATION_MAP)
STATUS_MIGRATION_MAP = {
    "Completed": "Completed/To be Filed",
    "Needs Office Work": "Fieldwork Complete",
    "Invoice Sent": "Survey Complete/Invoice Sent",
    "Set Pins": "Set/Flag Pins",
    "On Hold": "On Hold/Pending Estimate",
    "Ongoing Site": "Site Plan",
    # These remain unchanged but included for completeness
    "To Be Printed": "To Be Printed",
    "Needs Fieldwork": "Needs Fieldwork",
    "Quote Available": "Quote Available",
}


def upgrade():
    """Update old status names to new status names"""
    conn = op.get_bind()
    
    # Update each status value
    for old_status, new_status in STATUS_MIGRATION_MAP.items():
        if old_status != new_status:  # Only update if different
            update_sql = text(
                "UPDATE jobs SET status = :new_status WHERE status = :old_status"
            )
            result = conn.execute(
                update_sql,
                {"old_status": old_status, "new_status": new_status}
            )
            print(f"Updated {result.rowcount} jobs from '{old_status}' to '{new_status}'")


def downgrade():
    """Revert new status names back to old status names"""
    conn = op.get_bind()
    
    # Reverse the mapping
    reverse_map = {v: k for k, v in STATUS_MIGRATION_MAP.items() if k != v}
    
    # Update each status value back
    for new_status, old_status in reverse_map.items():
        update_sql = text(
            "UPDATE jobs SET status = :old_status WHERE status = :new_status"
        )
        result = conn.execute(
            update_sql,
            {"old_status": old_status, "new_status": new_status}
        )
        print(f"Reverted {result.rowcount} jobs from '{new_status}' back to '{old_status}'")

