"""
Add parcel geocoding fields to jobs table

This migration adds two new columns to support parcel-based job creation:
- is_parcel_job: Boolean flag to identify jobs created from parcel lookups
- parcel_data: JSON field to store parcel metadata (ID, county, lookup details)
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from models import db
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def upgrade():
    """Add new columns to jobs table"""
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    
    db.init_app(app)
    
    with app.app_context():
        # Add is_parcel_job column
        try:
            from sqlalchemy import text
            db.session.execute(text("""
                ALTER TABLE jobs 
                ADD COLUMN is_parcel_job BOOLEAN DEFAULT FALSE
            """))
            print("✓ Added is_parcel_job column")
        except Exception as e:
            print(f"Column is_parcel_job may already exist: {e}")
        
        # Add parcel_data column
        try:
            from sqlalchemy import text
            db.session.execute(text("""
                ALTER TABLE jobs 
                ADD COLUMN parcel_data JSON
            """))
            print("✓ Added parcel_data column")
        except Exception as e:
            print(f"Column parcel_data may already exist: {e}")
        
        # Commit changes
        try:
            db.session.commit()
            print("✓ Migration completed successfully")
        except Exception as e:
            db.session.rollback()
            print(f"Error committing migration: {e}")
            raise

def downgrade():
    """Remove parcel columns from jobs table"""
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    
    db.init_app(app)
    
    with app.app_context():
        try:
            from sqlalchemy import text
            db.session.execute(text("""
                ALTER TABLE jobs 
                DROP COLUMN is_parcel_job,
                DROP COLUMN parcel_data
            """))
            db.session.commit()
            print("✓ Downgrade completed successfully")
        except Exception as e:
            db.session.rollback()
            print(f"Error during downgrade: {e}")
            raise

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Parcel fields migration")
    parser.add_argument("--downgrade", action="store_true", help="Rollback migration")
    args = parser.parse_args()
    
    if args.downgrade:
        print("Rolling back parcel fields migration...")
        downgrade()
    else:
        print("Applying parcel fields migration...")
        upgrade()