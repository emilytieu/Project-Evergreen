from flask import Flask, jsonify, render_template, send_from_directory, request
import requests, os, re
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
 
load_dotenv()

app = Flask(__name__)
DATA_DIR      = Path(os.getenv("DATA_DIR", "./data"))
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AI_MODEL      = "claude-sonnet-4-20250514"

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
 
 
# ── Category-specific parsers ─────────────────────────────────────────────────
 
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
            "category":     "electrolyzer",
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
 
 
# Maps CSV filename stem → parser function
# Add entries here when you add more CSV files.
CATEGORY_PARSERS = {
    "electrolyzers": parse_electrolyzers,
    # "rectifiers":  parse_rectifiers,   ← add yours here
    # "compressors": parse_compressors,
    # "storage":     parse_storage,
}
 
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
 
 
# ── AI assistant ──────────────────────────────────────────────────────────────
 
def _build_component_context(components: list[dict], max_items=20) -> str:
    """Serialise components into a compact text block for the AI prompt."""
    lines = []
    for c in components[:max_items]:
        parts = [f"[{c['category'].upper()}] {c['name']}"]
        if c.get("type"):             parts.append(f"Type: {c['type']}")
        if c.get("output_nm3h"):      parts.append(f"Output: {c['output_nm3h']} Nm³/h")
        if c.get("power_raw"):        parts.append(f"Power: {c['power_raw']}")
        if c.get("output_pressure_bar"): parts.append(f"Pressure: {c['output_pressure_bar']} bar")
        if c.get("efficiency"):       parts.append(f"Efficiency: {c['efficiency']}%")
        if c.get("purity_pct"):       parts.append(f"Purity: {c['purity_pct']}%")
        if c.get("price"):            parts.append(f"Price: ${c['price']:,.0f}")
        if c.get("country"):          parts.append(f"Country: {c['country']}")
        if c.get("modular"):          parts.append("Modular: yes")
        if c.get("compressor_included"): parts.append("Compressor included: yes")
        if c.get("notes"):            parts.append(f"Notes: {c['notes']}")
        lines.append(" | ".join(parts))
    if len(components) > max_items:
        lines.append(f"... and {len(components) - max_items} more components not shown")
    return "\n".join(lines)
 
 
SYSTEM_PROMPT = """You are an expert hydrogen systems engineering assistant for Project Evergreen, \
an educational platform about green hydrogen technology.
 
You help engineers, researchers, and learners understand, compare, and choose \
hydrogen system components — electrolyzers, compressors, storage tanks, rectifiers, \
fuel cells, purifiers, sensors, and controllers.
 
You have access to a real component database. When answering:
- Be specific: reference actual component names, brands, and specs from the database context provided
- Explain trade-offs clearly (PEM vs Alkaline vs SOEC, modular vs fixed, etc.)
- Use metric units (Nm³/h, kWh/Nm³, barg) and explain them when helpful
- Flag important safety or compatibility considerations
- Keep answers concise but complete — bullet points are fine for comparisons
- If something isn't in the database, say so clearly
 
You are NOT a general chatbot — stay focused on hydrogen system topics."""
 
 
def ask_ai(user_message: str, history: list[dict],
           component_context: str = "") -> str:
    """Call Claude with RAG context injected into the system prompt."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    except Exception as e:
        return f"⚠ Could not initialise AI client: {e}"
 
    system = SYSTEM_PROMPT
    if component_context:
        system += f"\n\n--- CURRENT DATABASE CONTEXT (visible components) ---\n{component_context}"
 
    # Build message list — trim to last 10 turns to stay within context
    messages = []
    for turn in history[-10:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_message})
 
    try:
        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=1024,
            system=system,
            messages=messages,
        )
        return response.content[0].text
    except Exception as e:
        return f"⚠ AI error: {e}"
    
# ── Flask routes ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

def serve():
    return send_from_directory("frontend/dist", "index.html")

@app.route("/<path:path>")
def static_proxy(path):
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
 
 
@app.route("/api/chat", methods=["POST"])
def api_chat():
    body    = request.json or {}
    message = body.get("message", "").strip()
    history = body.get("history", [])
    # Optional: pass current search state so AI has context of what user is viewing
    current_query    = body.get("current_query", "")
    current_category = body.get("current_category", "all")
    current_sort     = body.get("current_sort", "name")
 
    if not message:
        return jsonify({"error": "Empty message"}), 400
 
    # Build context from currently visible components
    visible = _search_components(current_query, current_category, current_sort)
    context = _build_component_context(visible, max_items=25)
 
    reply = ask_ai(message, history, context)
    return jsonify({"reply": reply})
 
 
@app.route("/api/reload")
def api_reload():
    """Dev-only: hot-reload CSVs without restarting."""
    load_components()
    return jsonify({"ok": True, "total": len(ALL_COMPONENTS)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True, threaded=True)