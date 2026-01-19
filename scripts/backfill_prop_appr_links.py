#!/usr/bin/env python3
"""
Backfill property appraiser links for existing jobs.

This script populates the prop_appr_link field for jobs that don't have one.
It queries external APIs with rate limiting to avoid overwhelming services.

Usage:
    python scripts/backfill_prop_appr_links.py [--dry-run] [--prefix 26-]
"""

import argparse
import sys
import time
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app
from models import db, Job
from utils import get_brevard_property_link, get_orange_property_link

# Rate limiting settings
DELAY_BETWEEN_REQUESTS = 1.0  # seconds between API calls
BATCH_SIZE = 10  # jobs to process before longer pause
BATCH_DELAY = 5.0  # seconds to pause between batches


def backfill_links(prefix="26-", dry_run=False):
    """
    Backfill property appraiser links for jobs matching the prefix.

    Args:
        prefix: Job number prefix to filter (default: "26-")
        dry_run: If True, don't actually update the database
    """
    with app.app_context():
        # Query jobs that need backfilling
        jobs = Job.query.filter(
            Job.job_number.like(f"{prefix}%"),
            Job.deleted_at.is_(None),
            Job.prop_appr_link.is_(None),
            Job.county.isnot(None)
        ).all()

        total = len(jobs)
        print(f"Found {total} jobs with prefix '{prefix}' needing prop_appr_link")

        if total == 0:
            print("Nothing to do.")
            return

        if dry_run:
            print("[DRY RUN] No changes will be made")

        updated = 0
        skipped = 0
        errors = 0

        for i, job in enumerate(jobs, 1):
            county = (job.county or "").lower()
            link = None

            try:
                if county == "brevard":
                    # Get coordinates for fallback lookup
                    lat = float(job.lat) if job.lat else None
                    lng = float(job.long) if job.long else None

                    if job.address or (lat and lng):
                        print(f"[{i}/{total}] {job.job_number}: Querying Brevard...")
                        link = get_brevard_property_link(address=job.address, lat=lat, lng=lng)
                    else:
                        print(f"[{i}/{total}] {job.job_number}: Skipping Brevard job with no address or coordinates")
                        skipped += 1
                        continue

                elif county == "orange":
                    # For Orange, try parcel_id first, then address
                    parcel_id = None
                    if job.parcel_data and isinstance(job.parcel_data, dict):
                        parcel_id = job.parcel_data.get("parcel_id")

                    if parcel_id:
                        print(f"[{i}/{total}] {job.job_number}: Building Orange link from parcel_id...")
                        link = get_orange_property_link(parcel_id=parcel_id)
                    elif job.address:
                        print(f"[{i}/{total}] {job.job_number}: Querying Orange by address...")
                        link = get_orange_property_link(address=job.address)
                    else:
                        print(f"[{i}/{total}] {job.job_number}: Skipping Orange job with no parcel_id or address")
                        skipped += 1
                        continue
                else:
                    print(f"[{i}/{total}] {job.job_number}: Skipping unsupported county '{job.county}'")
                    skipped += 1
                    continue

                if link:
                    if not dry_run:
                        job.prop_appr_link = link
                        db.session.commit()
                    print(f"  -> Set link: {link[:60]}...")
                    updated += 1
                else:
                    print(f"  -> No link found")
                    skipped += 1

            except Exception as e:
                print(f"  -> ERROR: {e}")
                errors += 1
                if not dry_run:
                    db.session.rollback()

            # Rate limiting
            time.sleep(DELAY_BETWEEN_REQUESTS)

            # Longer pause between batches
            if i % BATCH_SIZE == 0 and i < total:
                print(f"  [Pausing {BATCH_DELAY}s after batch of {BATCH_SIZE}...]")
                time.sleep(BATCH_DELAY)

        print()
        print("=" * 50)
        print(f"Complete! Updated: {updated}, Skipped: {skipped}, Errors: {errors}")
        if dry_run:
            print("[DRY RUN] No changes were made to the database")


def main():
    parser = argparse.ArgumentParser(
        description="Backfill property appraiser links for existing jobs"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--prefix",
        default="26-",
        help="Job number prefix to filter (default: 26-)"
    )

    args = parser.parse_args()

    print("Property Appraiser Link Backfill Script")
    print("=" * 50)
    print(f"Prefix: {args.prefix}")
    print(f"Dry run: {args.dry_run}")
    print(f"Rate limit: {DELAY_BETWEEN_REQUESTS}s between requests")
    print(f"Batch size: {BATCH_SIZE} jobs, {BATCH_DELAY}s pause between batches")
    print("=" * 50)
    print()

    backfill_links(prefix=args.prefix, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
