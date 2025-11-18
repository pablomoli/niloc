#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

# 1) import your real app
from app import app

# 2) path to your spreadsheet
EXCEL_PATH = Path(__file__).parent / "data.xlsx"

# 3) admin credentials
ADMIN_USER = "pablo"
ADMIN_PASS = "123"


def main():
    # Check if file exists
    if not EXCEL_PATH.exists():
        print(f"❌ Error: {EXCEL_PATH} not found!")
        return

    # Load the sheet into a DataFrame - use the "final" sheet which has the correct columns
    print(f"📖 Loading data from {EXCEL_PATH} (final sheet)...")
    df = pd.read_excel(EXCEL_PATH, engine="openpyxl")

    print(f"📊 Total rows in spreadsheet: {len(df)}")
    print(f"📋 Available columns: {list(df.columns)}")

    # Check for required columns
    required_cols = ["Valid", "Type"]
    missing_cols = [col for col in required_cols if col not in df.columns]

    if missing_cols:
        print(f"❌ Error: Missing required columns: {missing_cols}")
        print(f"💡 Available columns: {list(df.columns)}")
        return

    # Filter for valid estimates only
    # Valid = 1.0 (float) AND Type = "Estimate"
    valid_estimates = df[(df["Valid"] == 1.0) & (df["Type"] == "Estimate")]

    print(f"🎯 Found {len(valid_estimates)} valid estimates to process")

    if len(valid_estimates) == 0:
        print("ℹ️  No valid estimates found. Exiting.")
        return

    # Convert to list of dicts for easier processing
    rows = []
    for _, row in valid_estimates.iterrows():
        rows.append(row.to_dict())

    # Track which rows we successfully plot
    plotted_indices = []

    # 4) use Flask's test_client
    with app.test_client() as client:
        # 4a) log in
        print(f"🔐 Logging in as {ADMIN_USER}...")
        login_resp = client.post(
            "/login",
            data={"username": ADMIN_USER, "password": ADMIN_PASS},
            follow_redirects=True,
        )

        if login_resp.status_code != 200:
            print(f"❌ Login failed: {login_resp.status_code}")
            return

        print("✅ Logged in successfully. Now creating jobs...")

        # 4b) Create jobs via API
        successful_jobs = 0
        failed_jobs = 0

        for i, row in enumerate(rows, start=1):
            # Get the original index in the DataFrame for updating later
            original_index = valid_estimates.index[i - 1]

            # Build the job payload - adjust field names as needed for your data
            payload = {
                "job_number": str(row.get("Num", f"JOB-{i}")),
                "client": str(row.get("Client", "Unknown Client")),
                "address": str(row.get("Address", "Unknown Address")),
                "status": "Quote Available",  # default status
            }

            # Make the API call - use form data as expected by the endpoint
            resp = client.post("/api/jobs", data=payload)

            if resp.status_code in (200, 201):
                print(f"[{i:3d}] ✔️ Created job {payload['job_number']}")
                plotted_indices.append(original_index)
                successful_jobs += 1
            else:
                error_msg = (
                    resp.get_data(as_text=True)[:200]
                    if resp.get_data()
                    else "Unknown error"
                )
                print(
                    f"[{i:3d}] ❌ Failed {payload['job_number']}: {resp.status_code} {error_msg}"
                )
                # Debug: print the payload for the first few failures
                if failed_jobs < 3:
                    print(f"    Debug payload: {payload}")
                failed_jobs += 1

    # 5) Update the Excel file - mark plotted rows
    if plotted_indices:
        print(
            f"\n📝 Updating Excel file - marking {len(plotted_indices)} rows as plotted..."
        )

        try:
            # Set Plotted = 1 for successfully created jobs
            df.loc[plotted_indices, "Plotted"] = 1

            # Save back to Excel
            df.to_excel(EXCEL_PATH, index=False, engine="openpyxl")
            print(
                f"✅ Updated {EXCEL_PATH} - marked {len(plotted_indices)} rows as plotted"
            )

        except Exception as e:
            print(f"⚠️  Warning: Could not update Excel file: {str(e)}")
            print(
                "   Jobs were created successfully, but Plotted column was not updated"
            )

    # Final summary
    print("\n📈 Summary:")
    print(f"   Total valid estimates found: {len(valid_estimates)}")
    print(f"   Jobs created successfully: {successful_jobs}")
    print(f"   Jobs failed to create: {failed_jobs}")
    print(f"   Rows marked as plotted: {len(plotted_indices)}")

    if successful_jobs > 0:
        print(f"\n🎉 Successfully populated {successful_jobs} jobs from data.xlsx!")

    if failed_jobs > 0:
        print(f"\n⚠️  {failed_jobs} jobs failed - check the error messages above")


def preview_data():
    """Preview function to see what data would be processed without creating jobs"""
    if not EXCEL_PATH.exists():
        print(f"❌ Error: {EXCEL_PATH} not found!")
        return

    df = pd.read_excel(EXCEL_PATH, engine="openpyxl")
    print("📊 File info:")
    print(f"   Total rows: {len(df)}")
    print(f"   Available columns: {list(df.columns)}")

    # Show first few values of each column to understand the data structure
    print("\n🔍 First 3 values of each column:")
    for col in df.columns:
        sample_values = df[col].head(3).tolist()
        print(f"   '{col}': {sample_values}")

    # Check if required columns exist
    if "Valid" not in df.columns or "Type" not in df.columns:
        print("\n❌ Missing required columns:")
        if "Valid" not in df.columns:
            print("   - 'Valid' column not found")
        if "Type" not in df.columns:
            print("   - 'Type' column not found")

        # Look for similar column names
        print("\n🔍 Looking for similar column names...")
        possible_type_cols = [
            col
            for col in df.columns
            if "type" in col.lower() or "transaction" in col.lower()
        ]
        possible_valid_cols = [
            col for col in df.columns if "valid" in col.lower() or "plot" in col.lower()
        ]

        if possible_type_cols:
            print(f"   Possible 'Type' columns: {possible_type_cols}")
        if possible_valid_cols:
            print(f"   Possible 'Valid' columns: {possible_valid_cols}")

        print(
            "\n💡 Please check your Excel file column names or let me know which columns to use"
        )
        return

    valid_invoices = df[(df["Valid"] == 1) & (df["Type"] == "Estimate")]

    print(f"   Valid estimates: {len(valid_invoices)}")

    if len(valid_invoices) > 0:
        print("\n📋 Sample of valid estimates (first 5):")
        sample_cols = ["Num", "Client", "Address", "Type", "Valid", "Plotted"]
        available_cols = [col for col in sample_cols if col in valid_invoices.columns]
        sample_data = valid_invoices[available_cols].head()
        for _, row in sample_data.iterrows():
            print(f"   {row.to_dict()}")

    print("\n💡 Run main() to actually create the jobs")


if __name__ == "__main__":
    # Run preview first to see what's available
    # preview_data()

    # Uncomment the next line to run the actual import after checking the preview
    main()
