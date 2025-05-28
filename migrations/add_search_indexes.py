# migrations/add_search_indexes.py
# Database migration to add search performance indexes

from models import db
from sqlalchemy import text


def upgrade():
    """Add comprehensive search indexes for fuzzy matching performance"""

    print("Adding comprehensive search indexes for fuzzy matching...")

    try:
        # 1. Basic B-tree indexes for exact and prefix matches
        print("Creating basic search indexes...")

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_job_number_lower 
            ON jobs (LOWER(job_number));
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_client_lower 
            ON jobs (LOWER(client));
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_address_lower 
            ON jobs (LOWER(address));
        """)
        )

        # 2. Text pattern indexes for fuzzy matching
        print("Creating fuzzy matching indexes...")

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_job_number_clean 
            ON jobs (regexp_replace(LOWER(job_number), '[^a-z0-9]', '', 'g'));
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_client_clean 
            ON jobs (regexp_replace(LOWER(client), '[^a-z0-9 ]', ' ', 'g'));
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_address_clean 
            ON jobs (regexp_replace(LOWER(address), '[^a-z0-9 ]', ' ', 'g'));
        """)
        )

        # 3. Trigram indexes for advanced fuzzy matching (optional)
        print("Attempting to create trigram indexes...")
        try:
            db.session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))

            db.session.execute(
                text("""
                CREATE INDEX IF NOT EXISTS idx_jobs_job_number_trgm 
                ON jobs USING gin (job_number gin_trgm_ops);
            """)
            )

            db.session.execute(
                text("""
                CREATE INDEX IF NOT EXISTS idx_jobs_client_trgm 
                ON jobs USING gin (client gin_trgm_ops);
            """)
            )

            db.session.execute(
                text("""
                CREATE INDEX IF NOT EXISTS idx_jobs_address_trgm 
                ON jobs USING gin (address gin_trgm_ops);
            """)
            )

            print("✅ Trigram indexes created successfully!")

        except Exception as e:
            print(f"⚠️  Trigram indexes skipped: {e}")

        # 4. Composite index for common filter combinations
        print("Creating composite search index...")

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_search_composite 
            ON jobs (deleted_at, status, created_at DESC) 
            WHERE deleted_at IS NULL;
        """)
        )

        # 5. Partial indexes for active jobs only
        print("Creating partial indexes for active jobs...")

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_active_job_number 
            ON jobs (job_number) 
            WHERE deleted_at IS NULL;
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_active_client 
            ON jobs (client) 
            WHERE deleted_at IS NULL;
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_active_address 
            ON jobs (address) 
            WHERE deleted_at IS NULL;
        """)
        )

        # 6. Status index for filtering
        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_status 
            ON jobs (status) 
            WHERE deleted_at IS NULL;
        """)
        )

        # 7. Autocomplete indexes
        print("Creating autocomplete indexes...")

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_job_number_prefix 
            ON jobs (job_number text_pattern_ops) 
            WHERE deleted_at IS NULL;
        """)
        )

        db.session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_client_prefix 
            ON jobs (client text_pattern_ops) 
            WHERE deleted_at IS NULL;
        """)
        )

        db.session.commit()
        print("✅ All search indexes created successfully!")

    except Exception as e:
        print(f"❌ Error creating indexes: {e}")
        db.session.rollback()
        raise


def downgrade():
    """Remove comprehensive search indexes"""

    print("Removing search indexes...")

    try:
        indexes_to_drop = [
            "idx_jobs_job_number_lower",
            "idx_jobs_client_lower",
            "idx_jobs_address_lower",
            "idx_jobs_job_number_clean",
            "idx_jobs_client_clean",
            "idx_jobs_address_clean",
            "idx_jobs_job_number_trgm",
            "idx_jobs_client_trgm",
            "idx_jobs_address_trgm",
            "idx_jobs_search_composite",
            "idx_jobs_active_job_number",
            "idx_jobs_active_client",
            "idx_jobs_active_address",
            "idx_jobs_status",
            "idx_jobs_job_number_prefix",
            "idx_jobs_client_prefix",
        ]

        for index_name in indexes_to_drop:
            db.session.execute(
                text(f"""
                DROP INDEX IF EXISTS {index_name};
            """)
            )

        db.session.commit()
        print("✅ Search indexes removed successfully!")

    except Exception as e:
        print(f"❌ Error removing indexes: {e}")
        db.session.rollback()
        raise
