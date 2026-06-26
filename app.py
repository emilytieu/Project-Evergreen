from flask import Flask, jsonify, render_template, send_from_directory, request
import requests, os, re
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
 
load_dotenv()

app = Flask(__name__)
DATA_DIR      = Path(os.getenv("DATA_DIR", "./data"))

from backend.ml_api import ml_bp
app.register_blueprint(ml_bp, url_prefix="/api/ml")

#region Data parser helper functions
def _first_num(val: str):
    """Extract first numeric value from a messy string."""
    if not val or str(val).strip() in ("-", "", "nan", "?"):
        return None
    m = re.search(r"-?[\d]+\.?[\d]*", str(val).replace(",", ""))
    return float(m.group()) if m else None
 
def _nm3h(val: str):
    s = str(val)
    m = re.search(r"([\d,]+\.?[\d]*)\s*Nm.3/hr", s)
    if m: return float(m.group(1).replace(",", ""))
    m = re.search(r"([\d,]+\.?[\d]*)\s*Nm.3", s)
    if m: return float(m.group(1).replace(",", ""))
    return _first_num(val)
 
def _barg(val: str):
    s = str(val)
    m = re.search(r"([\d.]+)\s*bar[g]?", s)
    return float(m.group(1)) if m else _first_num(val)
 
def _tempc(val: str):
    m = re.search(r"(-?[\d]+)\s*C", str(val))
    return float(m.group(1)) if m else None
 
def _clean(val: str):
    s = str(val).strip()
    return s if s not in ("-", "", "nan", "None") else None
 
def _norm_type(t: str) -> str:
    u = str(t).upper()
    if "KOH" in u or "ALK" in u: return "Alkaline"
    if "PEM" in u:                return "PEM"
    if "SOE" in u:                return "SOEC"
    if "AEM" in u:                return "AEM"
    return _clean(t) or "Unknown"
 
def _eff(val: str):
    s = str(val).strip()
    if s in ("-", "", "nan"): return None
    m = re.search(r"([\d.]+)%", s)
    if m: return float(m.group(1))
    m = re.search(r">([\d.]+)", s)
    if m: return float(m.group(1))
    n = _first_num(s)
    return n if n and 0 < n <= 100 else None

def _temp_min(value: str):
    nums = re.findall(r"-?\d+(?:\.\d+)?", str(value))
    return float(nums[0]) if nums else None

def _temp_max(value: str):
    nums = re.findall(r"-?\d+(?:\.\d+)?", str(value))
    return float(nums[1]) if len(nums) >= 2 else None

def _signed_percent(value: str):
    m = re.search(r"[-+]?\d+(?:\.\d+)?", str(value))
    return float(m.group()) if m else None
 
 #endregion
 
#region Cateogry specific parsers
 
def parse_electrolyzers(path: Path) -> list[dict]:
    df = pd.read_csv(path, dtype=str).fillna("-")
    records = []
    for idx, row in enumerate(df.to_dict("records")):
        mfr = _clean(row.get("Manufacturer", "")) or ""
        mod = _clean(row.get("Model Name", "")) or ""
        if not mfr and not mod:
            continue
        elz_type   = _norm_type(row.get("Electrolyzer Type", ""))
        output     = _nm3h(row.get("Hydrogen Production Rate", ""))
        tags       = []
        if output:
            tags.append("small-scale" if output < 5 else "mid-scale" if output < 100 else "industrial")
        tags.append(elz_type.lower())
        if str(row.get("Modular?", "")).strip().lower() == "yes":      tags.append("modular")
        if str(row.get("Compressor Included?", "")).strip().lower() == "yes": tags.append("compressor-included")
        if str(row.get("Input Power Type (AC/DC)", "DC")).strip().upper() == "AC": tags.append("AC-ready")
 
        records.append({
            "id":           f"elz-{idx}",
            "category":     "Electrolyzers",
            "name":         f"{mfr} {mod}".strip(),
            "brand":        mfr,
            "model":        mod,
            "country":      _clean(row.get("Country", "")),
            "year":         _clean(row.get("Year Created", "")),
            "type":         elz_type,
            "input_power_type": _clean(row.get("Input Power Type (AC/DC)", "")),
            "output_nm3h":  output,
            "output_pressure_bar": _barg(row.get("Hydrogen Output Pressure", "")),
            "purity_pct":   _first_num(row.get("Hydrogen Output Putiry", "")),
            "power_consumption_kwh_nm3": _first_num(row.get("Power Consumption", "")),
            "water_consumption_l_nm3":   _first_num(row.get("Water Consumption", "")),
            "efficiency":   _eff(row.get("Efficiency", "")),
            "system_lifetime": _clean(row.get("System Lifetime", "")),
            "turndown_range":  _clean(row.get("Operating/Turndown Range (%)", "")),
            "footprint":    _clean(row.get("Footprint", "")),
            "weight":       _clean(row.get("Weight", "")),
            "modular":      str(row.get("Modular?", "")).strip().lower() == "yes",
            "compressor_included": str(row.get("Compressor Included?", "")).strip().lower() == "yes",
            "compressor_output_bar": _barg(row.get("Compressor Output Pressure", "")) if _clean(row.get("Compressor Output Pressure", "")) else None,
            "temp_min_c":   _tempc(row.get("Minimum Environmental Temperature ", "")),
            "temp_max_c":   _tempc(row.get("Maximum Environmental Temperature", "")),
            "price":        _first_num(row.get("Price ($USD)", "")),
            "notes":        _clean(row.get("Notes", "")),
            "tags":         list(set(tags)),
            # raw strings preserved for display accuracy
            "production_rate_raw": _clean(row.get("Hydrogen Production Rate", "")),
            "power_raw":    _clean(row.get("Power Consumption", "")),
            "pressure_raw": _clean(row.get("Hydrogen Output Pressure", "")),
        })
    return records

def parse_solar_panels(path: Path) -> list[dict]:
    df = pd.read_csv(path, dtype=str).fillna("-")

    records = []

    for idx, row in enumerate(df.to_dict("records")):
        model = _clean(row.get("Model", ""))
        series = _clean(row.get("Series", ""))

        if not model:
            continue

        tech = _clean(row.get("Technology", ""))

        stc_power = _first_num(row.get("STC Maximum Power (Pm) [W]", ""))
        efficiency = _first_num(row.get("Module Efficiency [%]", ""))
        bifaciality = _first_num(row.get("Bifaciality", ""))

        tags = []

        # technology tags
        tech_l = tech.lower()

        if "hjt" in tech_l:
            tags.append("hjt")
        elif "perc" in tech_l:
            tags.append("perc")
        elif "n type" in tech_l or "n-type" in tech_l:
            tags.append("n-type")

        if "bifacial" in tech_l:
            tags.append("bifacial")

        # power class tags
        if stc_power:
            if stc_power < 450:
                tags.append("residential")
            elif stc_power < 650:
                tags.append("commercial")
            else:
                tags.append("utility-scale")

        # efficiency class
        if efficiency:
            if efficiency >= 23:
                tags.append("high-efficiency")
            elif efficiency >= 21:
                tags.append("efficient")

        records.append({
            "id": f"pv-{idx}",
            "category": "Solar Panels",

            # identity
            "name": f"{series} {model}".strip(),
            "model": model,
            "series": series,
            "technology": tech,

            # electrical @ STC
            "stc_power_w": stc_power,
            "stc_vm_v": _first_num(row.get("STC Max Power Voltage (Vm) [V]", "")),
            "stc_im_a": _first_num(row.get("STC Max Power Current (Im) [A]", "")),
            "voc_v": _first_num(row.get("STC Open Circuit Voltage (Voc) [V]", "")),
            "isc_a": _first_num(row.get("STC Short Circuit Current (Isc) [A]", "")),
            "power_tolerance_w": _clean(row.get("Power Tolerance [W]", "")),

            # efficiency
            "module_efficiency_pct": efficiency,
            "bifaciality_pct": bifaciality,

            # NMOT
            "nmot_power_w": _first_num(row.get("NMOT Maximum Power (Pm) [W]", "")),
            "nmot_vm_v": _first_num(row.get("NMOT Max Power Voltage (Vm) [V]", "")),
            "nmot_im_a": _first_num(row.get("NMOT Max Power Current (Im) [A]", "")),
            "nmot_voc_v": _first_num(row.get("NMOT Open Circuit Voltage (Voc) [V]", "")),
            "nmot_isc_a": _first_num(row.get("NMOT Short Circuit Current (Isc) [A]", "")),

            # physical
            "dimensions": _clean(row.get("Dimensions", "")),
            "weight_kg": _first_num(row.get("Weight", "")),
            "cells": _clean(row.get("Number of Cells", "")),
            "front_glass": _clean(row.get("Front Glass", "")),
            "rear_glass": _clean(row.get("Rear Glass", "")),
            "frame": _clean(row.get("Frame", "")),

            # electrical / safety
            "junction_box": _clean(row.get("Junction Box", "")),
            "connector": _clean(row.get("Connector", "")),
            "output_cables": _clean(row.get("Output Cables", "")),
            "max_system_voltage_v": _first_num(
                row.get("Maximum System Voltage", "")
            ),
            "max_series_fuse_a": _first_num(
                row.get("Maximum Series Fuse Rating", "")
            ),

            # environmental
            "temp_min_c": _temp_min(row.get("Operating Temperature", "")),
            "temp_max_c": _temp_max(row.get("Operating Temperature", "")),
            "nominal_module_temp_c": _first_num(
                row.get("Nominal Module Operating Temperature", "")
            ),

            # temperature coefficients
            "temp_coeff_pmax_pct_c": _signed_percent(
                row.get("Temperature Coefficient of Pmax", "")
            ),
            "temp_coeff_voc_pct_c": _signed_percent(
                row.get("Temperature Coefficient of Voc", "")
            ),
            "temp_coeff_isc_pct_c": _signed_percent(
                row.get("Temperature Coefficient of Isc", "")
            ),

            # mechanical
            "mechanical_load": _clean(row.get("Mechanical Load", "")),
            "hail_test": _clean(row.get("Hail Test", "")),
            "application_rating": _clean(row.get("Application Rating", "")),

            # warranties
            "product_warranty": _clean(row.get("Product Warranty", "")),
            "linear_power_warranty": _clean(
                row.get("Linear Power Output Warranty", "")
            ),

            # logistics
            "container": _clean(row.get("Container", "")),
            "pieces_per_pallet": _first_num(
                row.get("Pieces per Pallet", "")
            ),
            "pieces_per_container": _first_num(
                row.get("Pieces per Container", "")
            ),

            # tags
            "tags": sorted(set(tags)),

            # raw values preserved
            "stc_power_raw": _clean(
                row.get("STC Maximum Power (Pm) [W]", "")
            ),
            "efficiency_raw": _clean(
                row.get("Module Efficiency [%]", "")
            ),
            "temperature_range_raw": _clean(
                row.get("Operating Temperature", "")
            ),
        })

    return records
 
 
# Maps CSV filename stem → parser function
# Add entries here when you add more CSV files.
CATEGORY_PARSERS = {
    "electrolyzers": parse_electrolyzers,
    "solar_panels": parse_solar_panels,
    # "rectifiers":  parse_rectifiers,   ← add yours here
    # "compressors": parse_compressors,
    # "storage":     parse_storage,
}
 #endregion

# ── Load all components at startup ────────────────────────────────────────────
 
ALL_COMPONENTS: list[dict] = []
 
def load_components():
    global ALL_COMPONENTS
    ALL_COMPONENTS = []
    if not DATA_DIR.exists():
        print(f"⚠  DATA_DIR '{DATA_DIR}' not found — no components loaded")
        return
    for csv_file in sorted(DATA_DIR.glob("*.csv")):
        stem = csv_file.stem.lower()
        parser = CATEGORY_PARSERS.get(stem)
        if parser:
            parts = parser(csv_file)
            ALL_COMPONENTS.extend(parts)
            print(f"  Loaded {len(parts):>3} {stem}")
        else:
            print(f"  Skipped {csv_file.name} (no parser — add one to CATEGORY_PARSERS)")
    print(f"  Total: {len(ALL_COMPONENTS)} components")
 
load_components()
 
 
# ── Search & filter ───────────────────────────────────────────────────────────
 
def _search_components(query="", category="all", sort="name",
                       filters: dict = None) -> list[dict]:
    """Filter + sort ALL_COMPONENTS. Returns list of matching dicts."""
    results = ALL_COMPONENTS[:]
 
    if category != "all":
        results = [c for c in results if c.get("category") == category]
 
    if query:
        q = query.lower()
        results = [c for c in results if any(
            q in str(c.get(f, "")).lower()
            for f in ("name", "brand", "model", "country", "type", "notes", "tags")
        )]
 
    if filters:
        for key, val in filters.items():
            if val is None:
                continue
            if key == "type":
                results = [c for c in results if c.get("type", "").lower() == val.lower()]
            elif key == "modular":
                results = [c for c in results if c.get("modular") == (val in (True, "true", "yes"))]
            elif key == "compressor_included":
                results = [c for c in results if c.get("compressor_included") == (val in (True, "true", "yes"))]
            elif key == "min_output_nm3h":
                results = [c for c in results if (c.get("output_nm3h") or 0) >= float(val)]
            elif key == "max_output_nm3h":
                results = [c for c in results if (c.get("output_nm3h") or 0) <= float(val)]
 
    key_map = {
        "output_desc": lambda c: -(c.get("output_nm3h") or 0),
        "output_asc":  lambda c:  (c.get("output_nm3h") or 0),
        "price_asc":   lambda c:  (c.get("price") or 1e9),
        "price_desc":  lambda c: -(c.get("price") or -1),
        "efficiency":  lambda c: -(c.get("efficiency") or 0),
        "name":        lambda c:   c.get("name", ""),
    }
    results.sort(key=key_map.get(sort, key_map["name"]))
    return results

# ==================
#region Flask routes
@app.route("/")
def index():
    return render_template("index.html")

def serve():
    return send_from_directory("frontend/dist", "index.html")

@app.route("/<path:path>")

def static_proxy(path):
    if path.startswith("api/"):
        return {"error": "Not found"}, 404
    
    file_path = os.path.join("frontend/dist", path)

    if os.path.exists(file_path):
        return send_from_directory("frontend/dist", path)
    return send_from_directory("frontend/dist", "index.html")

@app.route("/build")
def build():
    return send_from_directory("frontend/dist", "index.html")

@app.route("/energy")
def energy():
    return render_template("energy.html")

@app.route("/explorer")
def explorer():
    categories = sorted(set(c["category"] for c in ALL_COMPONENTS))
    types      = sorted(set(c["type"] for c in ALL_COMPONENTS if c.get("type")))
    countries  = sorted(set(c["country"] for c in ALL_COMPONENTS if c.get("country")))
    return render_template(
        "explorer.html",
        total_count=len(ALL_COMPONENTS),
        categories=categories,
        types=types,
        countries=countries,
    )

@app.route("/api/energy") # REST API endpoint for energy data
def energy_data():
    url = "https://api.worldbank.org/v2/country/all/indicator/EG.USE.PCAP.KG.OE?format=json&per_page=5000"
    response = requests.get(url)
    data = response.json()

    latest_by_entity = {}

    for item in data[1]:
        code = item["country"]["id"]
        value = item["value"]
        year = int(item["date"])

        if value is None:
            continue
        if code not in latest_by_entity or year > int(latest_by_entity[code]["year"]):
            latest_by_entity[code] = {
                "country": item["country"]["value"],
                "year": year,
                "energy_use": value
            }

    results = list(latest_by_entity.values())
    return jsonify(results)

@app.route("/api/test")
def test():
    return jsonify({
        "message": "Flask backend connected"
    })

@app.route("/api/components")
def api_components():
    query    = request.args.get("q", "").strip()
    category = request.args.get("category", "all")
    sort     = request.args.get("sort", "name")
    filters  = {
        "type":               request.args.get("type") or None,
        "modular":            request.args.get("modular") or None,
        "compressor_included": request.args.get("compressor_included") or None,
        "min_output_nm3h":    request.args.get("min_output") or None,
        "max_output_nm3h":    request.args.get("max_output") or None,
    }
    results = _search_components(query, category, sort, filters)
    return jsonify({"results": results, "total": len(results)})
 
 
@app.route("/api/component/<comp_id>")
def api_component(comp_id):
    match = next((c for c in ALL_COMPONENTS if c["id"] == comp_id), None)
    if not match:
        return jsonify({"error": "Not found"}), 404
    return jsonify(match)
 
 
@app.route("/api/reload")
def api_reload():
    """Dev-only: hot-reload CSVs without restarting."""
    load_components()
    return jsonify({"ok": True, "total": len(ALL_COMPONENTS)})

#endregion

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True, threaded=True)