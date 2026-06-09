import pandas as pd
from sqlalchemy import create_engine, text

DB_USER = "postgres"
DB_PASSWORD = "edmonton817"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "hydrogen_builder"

CSV_FILE = "data/electrolyzers.csv"
engine = create_engine(
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

df = pd.read_csv(CSV_FILE)
df = df.where(pd.notnull(df), None)
print(f"Loaded {len(df)} electrolyzers")
print(df.columns.tolist())
print(df.head())
print(df.iloc[0].to_dict())

def clean_bool(value):
    if pd.isna(value):
        return None

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        value = value.strip().lower()
        if value in ("true", "yes", "y", "1"):
            return True
        if value in ("false", "no", "n", "0"):
            return False
        if value in ("", "-", "N/A", "n/a", "NA"):
            return None
    return None

def clean_column(name):
    return (
        name.lower()
        .replace(" ", "_")
        .replace("(", "")
        .replace(")", "")
        .replace("/", "_")
        .replace("%", "pct")
        .replace("$usd", "usd")
    )

df.columns = [clean_column(c) for c in df.columns]

with engine.begin() as conn:
    result = conn.execute(
        text("""
        SELECT id
        FROM component_types
        WHERE name = 'Electrolyzer'
        """)
    )
    electrolyzer_type_id = result.scalar()
    if electrolyzer_type_id is None:
        raise Exception(
            "Component type 'Electrolyzer' not found."
        )
    
count = 0
for index, row in df.iterrows():
    print(f"Processing row #{index} - Model: {row.get('Model Name')}")

    manufacturer_name = str(row.get("Manufacturer", "")).strip()
    country = str(row.get("Country", "")).strip()
    model_name = str(row.get("Model Name", "")).strip()
    
    if not manufacturer_name or not model_name:
        print(
            f"manufacturer='{manufacturer_name}', "
            f"model='{model_name}'"
        )
        continue
    
    try: 
        with engine.begin() as conn:
            conn.execute(
                text("""
                INSERT INTO manufacturers (
                    name,
                    country
                )
                VALUES (
                    :name,
                    :country
                )
                ON CONFLICT (name)
                DO NOTHING
                """),
                {
                    "name": manufacturer_name,
                    "country": country
                }
            )

            manufacturer_id = conn.execute(
                text("""
                SELECT id
                FROM manufacturers
                WHERE name = :name
                """),
                {
                    "name": manufacturer_name
                }
            ).scalar()

            component_id = conn.execute(
                text("""
                INSERT INTO components (
                    manufacturer_id,
                    component_type_id,
                    model_name,
                    year_created,
                    footprint_m2,
                    weight_kg,
                    modular,
                    notes
                )
                VALUES (
                    :manufacturer_id,
                    :component_type_id,
                    :model_name,
                    :year_created,
                    :footprint,
                    :weight,
                    :modular,
                    :notes
                )
                RETURNING id
                """),
                {
                    "manufacturer_id": manufacturer_id,
                    "component_type_id": electrolyzer_type_id,
                    "model_name": model_name,
                    "year_created": row.get("Year Created"),
                    "footprint": row.get("Footprint"),
                    "weight": row.get("Weight"),
                    "modular": clean_bool(row.get("Modular?")),
                    "notes": row.get("Notes")
                }
            ).scalar()

            conn.execute(
                text("""
                INSERT INTO electrolyzers (
                    component_id,
                    electrolyzer_type,
                    input_power_type,
                    power_consumption_kw,
                    water_consumption_lph,
                    hydrogen_production_rate_kgph,
                    hydrogen_output_pressure_bar,
                    hydrogen_purity_percent,
                    efficiency_percent,
                    system_lifetime_hours,
                    compressor_included,
                    compressor_output_pressure_bar,
                    min_environment_temp_c,
                    max_environment_temp_c,
                    price_usd
                )
                VALUES (
                    :component_id,
                    :electrolyzer_type,
                    :input_power_type,
                    :power_consumption,
                    :water_consumption,
                    :hydrogen_rate,
                    :pressure,
                    :purity,
                    :efficiency,
                    :lifetime,
                    :compressor,
                    :compressor_pressure,
                    :min_temp,
                    :max_temp,
                    :price
                )
                """),
                {
                    "component_id": component_id,
                    "electrolyzer_type": row.get("Electrolyzer Type"),
                    "input_power_type": row.get("Input Power Type (AC/DC)"),
                    "power_consumption": row.get("Power Consumption"),
                    "water_consumption": row.get("Water Consumption"),
                    "hydrogen_rate": row.get("Hydrogen Production Rate"),
                    "pressure": row.get("Hydrogen Output Pressure"),
                    "purity": row.get("Hydrogen Output Purity"),
                    "efficiency": row.get("Efficiency"),
                    "lifetime": row.get("System Lifetime"),
                    "compressor": clean_bool(row.get("Compressor Included?")),
                    "compressor_pressure": row.get("Compressor Output Pressure"),
                    "min_temp": row.get("Minimum Environmental Temperature"),
                    "max_temp": row.get("Maximum Environmental Temperature"),
                    "price": row.get("Price ($USD)")
                }
            )
            print(f"Inserted electrolyzer for {manufacturer_name} {model_name}")
            count += 1
        
    except Exception as e:
        print(f"FAILED ROW #{index}")
        print(row.to_dict())
        print("\nERROR:")
        print(e)
        continue

print(f"Successfully imported {count} electrolyzers")
