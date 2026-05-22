import requests
import pandas as pd
import os

API_KEY = "zzjyclUgAH8xqA3WmONLifQhBFiGvvcC4p0XfNHT"
OUTPUT_FILE = "data/hydrogen_components.csv"

ELECTROLYZER_FILE = "electrolyzers.xlsx"
FUEL_CELL_FILE = "fuel_cells.xlsx"
COMPRESSOR_FILE = "compressors.xlsx"

def get_solar_panel_data(lat, lon, system_capacity_kw=5, module_type=0, array_type=0, tilt=30, azimuth=180, losses=10):
    url = "https://developer.nrel.gov/api/pvwatts/v6.json"
    params = {
        "api_key": API_KEY,
        "lat": lat,
        "lon": lon,
        "system_capacity": system_capacity_kw,
        "module_type": module_type,  # 0=Standard,1=Premium,2=Thin Film
        "array_type": array_type,    # 0=Fixed Open Rack, 1=Roof Mount, 2=1-Axis, 3=2-Axis
        "tilt": tilt,
        "azimuth": azimuth,
        "losses": losses
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    
    panel_data = {
        "category": "Solar Panel",
        "name": f"PV System {lat},{lon}",
        "rated_wattage_W": system_capacity_kw * 1000,
        "ac_annual_output_kWh": data.get("outputs", {}).get("ac_annual", None),
        "dc_annual_output_kWh": data.get("outputs", {}).get("dc_annual", None),
        "efficiency": data.get("ac_annual", None),
        "lat": lat,
        "lon": lon
    }
    return panel_data

def read_datasheet(file_path, category):
    if not os.path.exists(file_path):
        print(f"Warning: {file_path} not found. Skipping {category}.")
        return pd.DataFrame()
    
    df = pd.read_excel(file_path)
    df["category"] = category
    return df

# === MAIN PROCESS ===
all_dataframes = []

# Solar Panels -- example location: New York City
solar_df = pd.DataFrame([get_solar_panel_data(40.7128, -74.0060)])
all_dataframes.append(solar_df)
print("Fetched solar panel data for New York City.")

# Electrolysers
electrolyser_df = read_datasheet(ELECTROLYZER_FILE, "Electrolyzer")
all_dataframes.append(electrolyser_df)

# Fuel Cells
fuel_cell_df = read_datasheet(FUEL_CELL_FILE, "Fuel Cell")
all_dataframes.append(fuel_cell_df)

# Compressors
compressor_df = read_datasheet(COMPRESSOR_FILE, "Compressor")
all_dataframes.append(compressor_df)

if all_dataframes:
    full_db = pd.concat(all_dataframes, ignore_index=True)
    full_db.to_csv(OUTPUT_FILE, index=False)
    print(f"Hydrogen component database saved to {OUTPUT_FILE}")
else:
    print("No data to save.")