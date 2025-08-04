import pandas as pd
from pyproj import Transformer
import pyogrio

# Read the shapefile using pyogrio
print("Reading Parcels.shp with pyogrio...")
parcels = pyogrio.read_dataframe("Parcels.shp")
print(f"Loaded {len(parcels)} parcels")

# Check the CRS
print(f"CRS: {parcels.crs}")

# Check columns
print(f"\nColumns: {parcels.columns.tolist()}")

# Look at sample data
print("\nSample data:")
print(parcels[["TaxAcct", "Name"]].head(10))

# Calculate centroids
print("\nCalculating centroids...")
parcels["centroid"] = parcels.geometry.centroid
parcels["x_state_plane"] = parcels.centroid.x
parcels["y_state_plane"] = parcels.centroid.y

# Create transformer from Florida State Plane to WGS84
# pyogrio returns the CRS as a pyproj.CRS object
transformer = Transformer.from_crs(parcels.crs, "EPSG:4326", always_xy=True)

# Transform all centroids to lat/lon
print("Converting to WGS84...")
coords_wgs84 = parcels.apply(
    lambda row: transformer.transform(row["x_state_plane"], row["y_state_plane"]),
    axis=1,
)

# Extract lat/lon
parcels["longitude"] = coords_wgs84.apply(lambda x: x[0])
parcels["latitude"] = coords_wgs84.apply(lambda x: x[1])

# Create lookup dataframe with just the fields you need
lookup_df = parcels[
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
].copy()

# Save to CSV
output_file = "brevard_parcel_coordinates.csv"
lookup_df.to_csv(output_file, index=False)
print(f"\nSaved {len(lookup_df)} parcels to {output_file}")

# Test lookups
print("\nTesting lookups...")

# Test by tax account
test_accounts = [2410725, 2954629, 2315213, 2002321]
for acct in test_accounts:
    match = lookup_df[lookup_df["TaxAcct"] == acct]
    if not match.empty:
        row = match.iloc[0]
        print(
            f"TaxAcct {acct}: Parcel {row['Name']} at ({row['latitude']:.6f}, {row['longitude']:.6f})"
        )

# Test by parcel ID
test_parcel = "20G-35-17-AL-25-4.01"
match = lookup_df[lookup_df["Name"] == test_parcel]
if not match.empty:
    row = match.iloc[0]
    print(
        f"\nParcel {test_parcel}: TaxAcct {row['TaxAcct']} at ({row['latitude']:.6f}, {row['longitude']:.6f})"
    )

# Show some stats
print(f"\nStats:")
print(f"Total parcels: {len(lookup_df)}")
print(f"Parcels with TaxAcct: {lookup_df['TaxAcct'].notna().sum()}")
print(f"Unique townships: {lookup_df['Township'].nunique()}")
