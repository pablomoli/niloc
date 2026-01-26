"""PostGIS optimizations: numeric coords, auto-sync trigger, dashboard view

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-01-25 14:00:00.000000

This migration includes three high-impact optimizations:
1. Convert lat/long from VARCHAR(20) to NUMERIC(10,7) for type safety and performance
2. Add database trigger to auto-sync geog column when lat/long change
3. Create materialized view for dashboard statistics (reduces 5 queries to 1)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = 'e5f6g7h8i9j0'
down_revision = 'd4e5f6g7h8i9'
branch_labels = None
depends_on = None


def upgrade():
    print("Starting PostGIS optimizations...")

    # =========================================================================
    # 1. CONVERT LAT/LONG FROM VARCHAR TO NUMERIC
    # =========================================================================
    print("Converting lat/long columns to NUMERIC...")

    # Add new numeric columns
    op.execute(text("""
        ALTER TABLE jobs
        ADD COLUMN lat_numeric NUMERIC(10, 7),
        ADD COLUMN long_numeric NUMERIC(10, 7)
    """))

    # Migrate data from varchar to numeric (only valid numeric strings)
    # Using raw string (r"") to avoid Python escape sequence warning
    op.execute(text(r"""
        UPDATE jobs
        SET lat_numeric = CAST(lat AS NUMERIC(10, 7)),
            long_numeric = CAST(long AS NUMERIC(10, 7))
        WHERE lat IS NOT NULL
          AND long IS NOT NULL
          AND lat ~ '^-?[0-9]+\.?[0-9]*$'
          AND long ~ '^-?[0-9]+\.?[0-9]*$'
    """))

    # Drop old varchar columns
    op.execute(text("ALTER TABLE jobs DROP COLUMN lat"))
    op.execute(text("ALTER TABLE jobs DROP COLUMN long"))

    # Rename new columns to original names
    op.execute(text("ALTER TABLE jobs RENAME COLUMN lat_numeric TO lat"))
    op.execute(text("ALTER TABLE jobs RENAME COLUMN long_numeric TO long"))

    print("Lat/long columns converted to NUMERIC(10, 7)")

    # =========================================================================
    # 2. CREATE TRIGGER TO AUTO-SYNC GEOG COLUMN
    # =========================================================================
    print("Creating auto-sync trigger for geog column...")

    # Create the trigger function
    op.execute(text("""
        CREATE OR REPLACE FUNCTION sync_job_geog()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Update geog when lat/long change
            IF NEW.lat IS NOT NULL AND NEW.long IS NOT NULL THEN
                NEW.geog := ST_SetSRID(ST_MakePoint(NEW.long, NEW.lat), 4326)::geography;
            ELSE
                NEW.geog := NULL;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """))

    # Create the trigger (fires on INSERT or UPDATE of lat/long)
    op.execute(text("""
        CREATE TRIGGER trg_sync_job_geog
        BEFORE INSERT OR UPDATE OF lat, long ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION sync_job_geog();
    """))

    print("Auto-sync trigger created")

    # =========================================================================
    # 3. CREATE MATERIALIZED VIEW FOR DASHBOARD STATS
    # =========================================================================
    print("Creating materialized view for dashboard statistics...")

    # Ensure clean state
    op.execute(text("DROP MATERIALIZED VIEW IF EXISTS mv_job_dashboard_stats"))

    op.execute(text("""
        CREATE MATERIALIZED VIEW mv_job_dashboard_stats AS
        WITH stats AS (
            SELECT
                COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_active_jobs,
                COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS total_deleted_jobs,
                COUNT(DISTINCT LOWER(TRIM(client))) FILTER (WHERE deleted_at IS NULL) AS unique_clients
            FROM jobs
        ),
        status_dist AS (
            SELECT
                COALESCE(status, 'No Status') AS status_name,
                COUNT(*) AS job_count
            FROM jobs
            WHERE deleted_at IS NULL
            GROUP BY status
        )
        SELECT
            s.total_active_jobs,
            s.total_deleted_jobs,
            s.unique_clients,
            (SELECT jsonb_object_agg(status_name, job_count) FROM status_dist) AS status_distribution,
            NOW() AS refreshed_at
        FROM stats s
    """))

    # Create unique index for concurrent refresh (must be on actual column)
    op.execute(text("""
        CREATE UNIQUE INDEX idx_mv_job_dashboard_stats_unique
        ON mv_job_dashboard_stats (refreshed_at)
    """))

    print("Materialized view mv_job_dashboard_stats created")

    # =========================================================================
    # 4. CREATE FUNCTION TO REFRESH DASHBOARD STATS
    # =========================================================================
    print("Creating refresh function...")

    op.execute(text("""
        CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_job_dashboard_stats;
        END;
        $$;
    """))

    # =========================================================================
    # 5. SCHEDULE AUTOMATIC REFRESH VIA PG_CRON
    # =========================================================================
    print("Setting up pg_cron for automatic refresh...")

    try:
        op.execute(text("CREATE EXTENSION IF NOT EXISTS pg_cron"))
        op.execute(text("GRANT USAGE ON SCHEMA cron TO postgres"))

        # Schedule refresh every 5 minutes
        op.execute(text("""
            SELECT cron.schedule(
                'refresh-dashboard-stats',
                '*/5 * * * *',
                'SELECT refresh_dashboard_stats()'
            )
        """))
        print("pg_cron scheduled job created")
    except Exception as e:
        print(f"pg_cron setup skipped (may not be available): {e}")

    print("PostGIS optimizations complete!")


def downgrade():
    print("Reverting PostGIS optimizations...")

    # Remove pg_cron job
    try:
        op.execute(text("SELECT cron.unschedule('refresh-dashboard-stats')"))
    except Exception:
        pass  # Job may not exist

    # Drop refresh function
    op.execute(text("DROP FUNCTION IF EXISTS refresh_dashboard_stats()"))

    # Drop materialized view
    op.execute(text("DROP MATERIALIZED VIEW IF EXISTS mv_job_dashboard_stats"))

    # Drop trigger and function
    op.execute(text("DROP TRIGGER IF EXISTS trg_sync_job_geog ON jobs"))
    op.execute(text("DROP FUNCTION IF EXISTS sync_job_geog()"))

    # Convert lat/long back to VARCHAR
    op.execute(text("""
        ALTER TABLE jobs
        ADD COLUMN lat_varchar VARCHAR(20),
        ADD COLUMN long_varchar VARCHAR(20)
    """))

    op.execute(text("""
        UPDATE jobs
        SET lat_varchar = lat::text,
            long_varchar = long::text
        WHERE lat IS NOT NULL OR long IS NOT NULL
    """))

    op.execute(text("ALTER TABLE jobs DROP COLUMN lat"))
    op.execute(text("ALTER TABLE jobs DROP COLUMN long"))

    op.execute(text("ALTER TABLE jobs RENAME COLUMN lat_varchar TO lat"))
    op.execute(text("ALTER TABLE jobs RENAME COLUMN long_varchar TO long"))

    print("PostGIS optimizations reverted")
