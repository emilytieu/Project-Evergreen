import requests
import csv

API_KEY = "6aKmjxHZsRq1y5AcdDvkd7m7queshYNGlRvRD3ik"
OUTPUT_FILE = "hydrogen_components.csv"

CATEGORIES = ["Solar Panels", "Electrolyzers", "Fuel Cells", "Compressors"]

FIELDS = {
    "Solar Panels": ["name", "manufacturer", "power_rating", "efficiency", "voltage"],
    "Electrolyzers": ["name", "manufacturer", "power_rating", "voltage", "hydrogen_output", "oxygen_output", "water_consumption", "efficiency"],
    "Fuel Cells": ["name", "manufacturer", "hydrogen_input", "oxygen_input", "power_output", "voltage", "efficiency"],
    "Compressors": ["name", "manufacturer", "power_rating", "voltage", "input_pressure", "output_pressure", "efficiency"]
}

def pull_openei_data(category):
    url = "https://api.openei.org/utility/technologies"
    params = {
        "api_key": API_KEY,
        "format": "json",
        "category": category
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("technologies", [])
    except Exception as e:
        print(f"Error pulling {category}: {e}")
        return []

def save_to_csv(all_data, filename):
    fieldnames = ["category"] + list({key for item in all_data for key in item.keys()})
    with open(filename, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in all_data:
            writer.writerow(row)
    print(f"Data saved to {filename}")

# ==============
all_components = []

for category in CATEGORIES:
    print(f"Pulling data for {category}...")
    entries = pull_openei_data(category)
    for entry in entries:
        row = {"category": category}
        for field in FIELDS.get(category, []):
            # Some entries may have different keys, try multiple common options
            value = entry.get(field) or entry.get(field.lower()) or entry.get(field.replace("_", "")) or ""
            row[field] = value
        all_components.append(row)

save_to_csv(all_components, OUTPUT_FILE)