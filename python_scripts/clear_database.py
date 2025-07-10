#!/usr/bin/env python3
"""
Database clearing script - DANGER: This will delete ALL Jobs and FieldWork data!
Use with extreme caution.
"""

from app import app
from models import db, Job, FieldWork

# Admin credentials - make sure these match your actual admin user
ADMIN_USER = "pablo"
ADMIN_PASS = "123"


def main():
    print("⚠️  WARNING: This will DELETE ALL Jobs and FieldWork data!")
    print("⚠️  This action cannot be undone!")
    print()

    # Safety confirmation
    confirmation = input("Type 'DELETE ALL DATA' to proceed: ")
    if confirmation != "DELETE ALL DATA":
        print("❌ Operation cancelled. Data is safe.")
        return

    print()
    print("🔥 Proceeding with data deletion...")

    # Use Flask's application context
    with app.app_context():
        try:
            # Get counts before deletion for reporting
            job_count = Job.query.count()
            fieldwork_count = FieldWork.query.count()

            print(f"📊 Found {job_count} jobs and {fieldwork_count} fieldwork entries")

            # Delete in the correct order (child tables first to avoid foreign key issues)
            print("🗑️  Deleting FieldWork entries...")
            deleted_fieldwork = FieldWork.query.delete()

            print("🗑️  Deleting Job entries...")
            deleted_jobs = Job.query.delete()

            # Commit the transaction
            db.session.commit()

            print("✅ Successfully deleted:")
            print(f"   - {deleted_jobs} jobs")
            print(f"   - {deleted_fieldwork} fieldwork entries")
            print()
            print("🧹 Database is now clean and ready for fresh data!")

        except Exception as e:
            # Roll back on error
            db.session.rollback()
            print(f"❌ Error during deletion: {str(e)}")
            print("🔄 Database rolled back - no changes made")
            raise


def verify_empty():
    """Verify that the tables are actually empty"""
    with app.app_context():
        job_count = Job.query.count()
        fieldwork_count = FieldWork.query.count()

        print("🔍 Verification:")
        print(f"   - Jobs remaining: {job_count}")
        print(f"   - FieldWork remaining: {fieldwork_count}")

        if job_count == 0 and fieldwork_count == 0:
            print("✅ Verification passed - tables are empty")
        else:
            print("⚠️  Warning: Some data may still remain")


if __name__ == "__main__":
    main()
    verify_empty()
