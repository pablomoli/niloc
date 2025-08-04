import pandas as pd

# Load CSV file
df = pd.read_csv("data.csv")

# City to County mapping
city_to_county = {
    "Orlando": "Orange",
    "0": "Ignore",
    "Christmas": "Orange",
    "Cocoa": "Brevard",
    "Merritt Island": "Brevard",
    "Harmony": "Osceola",
    "Oviedo": "Seminole",
    "Chuluota": "Seminole",
    "Clermont": "Lake",
    "Kissimmee": "Osceola",
    "St Cloud": "Osceola",
    "Dunnellon": "Marion",
    "Grant Valkeria": "Brevard",
    "Mims": "Brevard",
    "Sanford": "Seminole",
    "Titusville": "Brevard",
    "Altamonte Springs": "Seminole",
    "Bithlo": "Orange",
    "Cocoa Beach": "Brevard",
    "Dundee": "Polk",
    "Eustis": "Lake",
    "Geneva": "Seminole",
    "Homosassa": "Citrus",
    "Lake Wales": "Lake",
    "Lakeland": "Polk",
    "Malabar": "Brevard",
    "New Smyrna Beach": "Volusia",
    "Ocoee": "Orange",
    "Ovideo": "Seminole",
    "Winter Garden": "Orange",
}

# Normalize city names
df["original city"] = df["original city"].astype(str).str.strip()

# Only update County where Plotted != 1
df.loc[df["Plotted"] != 1, "County"] = df.loc[df["Plotted"] != 1, "original city"].map(
    lambda city: city_to_county.get(city, "Unknown")
)

# Optional: print city counts
# cities = {}
# for city, plotted in zip(df["original city"], df["Plotted"]):
#     if plotted != 1:
#         cities[city] = cities.get(city, 0) + 1
#
# cities = sorted(cities.items(), key=lambda x: x[1], reverse=True)
#
# total = 0
# for city, count in cities:
#     print(f"{city}: {count}")
#     total += count
# print(total)

# Save to new CSV
df.to_csv("data_with_county.csv", index=False)
