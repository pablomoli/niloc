# transform_parcel_format.py
import pandas as pd
import re

# Load the CSV
print("Loading parcel data...")
df = pd.read_csv("brevard_parcel_coordinates.csv")
print(f"Loaded {len(df)} parcels")


def transform_parcel_id(parcel_id):
    """
    Transform parcel IDs to match your format
    Examples:
    - 20G3517-AL-25-4.01 -> 20G-35-17-AL-25-4.01
    - 21 3529-02-*-11 -> 21-35-29-02-*-11
    - 23 3610-00-759 -> 23-36-10-00-759
    """
    if pd.isna(parcel_id):
        return parcel_id

    parcel_str = str(parcel_id)

    # Pattern 1: Township with letter suffix (e.g., 20G3517-AL-25-4.01)
    # Extract: 20G, 35, 17, then the rest
    match = re.match(r"^(\d{1,2}[A-Z])(\d{2})(\d{2})-(.+)$", parcel_str)
    if match:
        township, range_val, section, rest = match.groups()
        return f"{township}-{range_val}-{section}-{rest}"

    # Pattern 2: Space-separated format (e.g., "21 3529-02-*-11")
    # Already has township, range, section separated
    match = re.match(r"^(\d{1,2})\s+(\d{2})(\d{2})-(.+)$", parcel_str)
    if match:
        township, range_val, section, rest = match.groups()
        return f"{township}-{range_val}-{section}-{rest}"

    # Pattern 3: Simple format without clear separation (e.g., "24 3606-00-20")
    match = re.match(r"^(\d{1,2})\s+(\d{2})(\d{2})-(.+)$", parcel_str)
    if match:
        township, range_val, section, rest = match.groups()
        return f"{township}-{range_val}-{section}-{rest}"

    # If no pattern matches, return as-is
    return parcel_str


# Apply transformation
print("\nTransforming parcel IDs...")
df["Name_Original"] = df["Name"]
df["Name"] = df["Name"].apply(transform_parcel_id)

# Show some examples of the transformation
print("\nTransformation examples:")
samples = df[df["Name"] != df["Name_Original"]].head(20)
for _, row in samples.iterrows():
    print(f"  {row['Name_Original']} -> {row['Name']}")

# Save the transformed data
output_file = "brevard_parcel_coordinates_formatted.csv"
df[
    [
        "TaxAcct",
        "Name",
        "latitude",
        "longitude",
        "Acres",
        "Township",
        "Range",
        "Section",
    ]
].to_csv(output_file, index=False)
print(f"\nSaved formatted data to {output_file}")

# Test lookups with your format
test_parcels = ["20G-35-17-AL-25-4.01", "23-36-10-00-759", "29-38-17-02-I-13"]

print("\nTesting lookups with your format:")
for parcel in test_parcels:
    matches = df[df["Name"] == parcel]
    if not matches.empty:
        row = matches.iloc[0]
        print(
            f"✓ Found {parcel}: Tax {row['TaxAcct']} at ({row['latitude']:.6f}, {row['longitude']:.6f})"
        )
    else:
        print(f"✗ Not found: {parcel}")

# Also check if we can still find by tax account
print("\nTesting tax account lookups:")
for tax_acct in [2410725, 2954629, 2315213]:
    matches = df[df["TaxAcct"] == tax_acct]
    if not matches.empty:
        row = matches.iloc[0]
        print(f"✓ Tax {tax_acct}: {row['Name']} (was {row['Name_Original']})")
