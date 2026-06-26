"""
ML Prediction API
"""

import json
from pathlib import Path
import sys

import joblib
import numpy as np
from flask import Blueprint, Flask, jsonify, request
    
from data.train_model import (
    predict_h2,
    recommend_components,
    build_feature_vector,
    ELZ_SPECS,
    KG_PER_NM3_H2,
)

HERE       = Path(__file__).parent
MODEL_PATH = HERE / "model.pkl"
INFO_PATH  = HERE / "feature_info.json"
CSV_PATH   = HERE / "data" / "electrolyzers.csv"

model       = None
feature_info = {}

def _load():
    global model, feature_info
    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        print(f"✅  Model loaded from {MODEL_PATH}")
    else:
        print("⚠  model.pkl not found — run train_model.py first")
    if INFO_PATH.exists():
        feature_info = json.loads(INFO_PATH.read_text())

_load()

ml_bp = Blueprint("ml", __name__)

def _parse_float(val, default=None):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


@ml_bp.route("/predict", methods=["POST"])
def api_predict():
    """
    POST /api/ml/predict
    Body (JSON):
    {
        "solar_kw":           50,
        "wind_kw":            20,
        "electrolyzer_eff":   0.78,   // 0–1  OR  percent 60–95
        "operating_hours":    18,
        "water_availability": 0.9,    // 0–1
        "ambient_temp_c":     22,
        "electricity_price":  0.08,
        "elz_type":           "PEM"   // "PEM" | "Alkaline" | "SOEC"
    }
    Returns:
    {
        "h2_kg_day":        4.4,
        "h2_nm3_day":       49.0,
        "confidence_low":   2.0,
        "confidence_high":  6.8,
        "daily_energy_kwh": 329,
        "co2_avoided_kg":   39.2,
        "sensitivity":      {...}   // how each input affects output
    }
    """
    if model is None:
        return jsonify({"error": "Model not loaded. Run train_model.py first."}), 503

    body = request.json or {}

    solar_kw           = _parse_float(body.get("solar_kw"), 0)
    wind_kw            = _parse_float(body.get("wind_kw"), 0)
    operating_hours    = _parse_float(body.get("operating_hours"), 20)
    water_avail        = _parse_float(body.get("water_availability"), 1.0)
    ambient_temp_c     = _parse_float(body.get("ambient_temp_c"), 20)
    electricity_price  = _parse_float(body.get("electricity_price"), 0.08)
    elz_type           = str(body.get("elz_type", "PEM")).strip()

    # Accept efficiency as fraction (0.78) or percent (78)
    eff_raw = _parse_float(body.get("electrolyzer_eff"), 0.78)
    electrolyzer_eff = eff_raw / 100 if eff_raw > 1 else eff_raw
    electrolyzer_eff = max(0.01, min(1.0, electrolyzer_eff))

    # Main prediction
    result = predict_h2(
        model, solar_kw, wind_kw, electrolyzer_eff,
        operating_hours, water_avail, ambient_temp_c,
        electricity_price, elz_type,
    )

    # ── Sensitivity analysis: ±20% on each input ─────────────────────────────
    base_fv    = build_feature_vector(solar_kw, wind_kw, electrolyzer_eff,
                                      operating_hours, water_avail, ambient_temp_c,
                                      electricity_price, elz_type)
    base_pred  = float(model.predict([base_fv])[0])
    sensitivity = {}

    def perturb(param_name, delta_frac=0.20):
        """Return % change in H₂ output when param increases by delta_frac."""
        params = dict(
            solar_kw=solar_kw, wind_kw=wind_kw, electrolyzer_eff=electrolyzer_eff,
            operating_hours=operating_hours, water_avail=water_avail,
            ambient_temp_c=ambient_temp_c, electricity_price=electricity_price,
            elz_type=elz_type,
        )
        orig = params[param_name]
        if isinstance(orig, str):
            return None
        params[param_name] = orig * (1 + delta_frac)

        fv = build_feature_vector(
            params["solar_kw"], params["wind_kw"], params["electrolyzer_eff"],
            params["operating_hours"], params["water_avail"], params["ambient_temp_c"],
            params["electricity_price"], params["elz_type"],
        )
        perturbed = float(model.predict([fv])[0])
        return round((perturbed - base_pred) / max(base_pred, 0.001) * 100, 1)

    for p in ["solar_kw", "wind_kw", "electrolyzer_eff",
              "operating_hours", "water_avail", "ambient_temp_c", "electricity_price"]:
        sensitivity[p] = perturb(p)

    result["sensitivity"] = sensitivity
    result["inputs"] = {
        "solar_kw": solar_kw, "wind_kw": wind_kw,
        "electrolyzer_eff": round(electrolyzer_eff, 3),
        "operating_hours": operating_hours, "water_availability": water_avail,
        "ambient_temp_c": ambient_temp_c, "electricity_price": electricity_price,
        "elz_type": elz_type,
    }
    return jsonify(result)


@ml_bp.route("/recommend", methods=["POST"])
def api_recommend():
    """
    POST /api/ml/recommend
    Same inputs as /predict. Returns ranked electrolyzer recommendations
    from the real database, each with predicted daily output and explanations.
    """
    if model is None:
        return jsonify({"error": "Model not loaded."}), 503
    if not CSV_PATH.exists():
        return jsonify({"error": f"Electrolyzer CSV not found at {CSV_PATH}"}), 404

    body = request.json or {}
    solar_kw          = _parse_float(body.get("solar_kw"), 0)
    wind_kw           = _parse_float(body.get("wind_kw"), 0)
    operating_hours   = _parse_float(body.get("operating_hours"), 20)
    water_avail       = _parse_float(body.get("water_availability"), 1.0)
    ambient_temp_c    = _parse_float(body.get("ambient_temp_c"), 20)
    electricity_price = _parse_float(body.get("electricity_price"), 0.08)
    top_n             = int(body.get("top_n", 5))

    recs = recommend_components(
        model, solar_kw, wind_kw, water_avail, ambient_temp_c,
        electricity_price, operating_hours, CSV_PATH, top_n=top_n,
    )
    return jsonify({"recommendations": recs, "total": len(recs)})


@ml_bp.route("/sweep", methods=["POST"])
def api_sweep():
    """
    POST /api/ml/sweep
    Sweep one parameter across a range, holding others fixed.
    Used for the React sensitivity chart.

    Body: { ...inputs, "sweep_param": "solar_kw", "sweep_range": [0, 200], "steps": 40 }
    """
    if model is None:
        return jsonify({"error": "Model not loaded."}), 503

    body   = request.json or {}
    param  = body.get("sweep_param", "solar_kw")
    rng    = body.get("sweep_range", [0, 200])
    steps  = int(body.get("steps", 40))

    base = {
        "solar_kw":          _parse_float(body.get("solar_kw"), 50),
        "wind_kw":           _parse_float(body.get("wind_kw"), 20),
        "electrolyzer_eff":  _parse_float(body.get("electrolyzer_eff"), 0.78),
        "operating_hours":   _parse_float(body.get("operating_hours"), 18),
        "water_avail":       _parse_float(body.get("water_availability"), 0.9),
        "ambient_temp_c":    _parse_float(body.get("ambient_temp_c"), 22),
        "electricity_price": _parse_float(body.get("electricity_price"), 0.08),
        "elz_type":          body.get("elz_type", "PEM"),
    }

    param_key_map = {"water_availability": "water_avail", "electrolyzer_eff": "electrolyzer_eff"}
    actual_key = param_key_map.get(param, param)

    sweep_vals = np.linspace(rng[0], rng[1], steps)
    points = []
    for v in sweep_vals:
        p = base.copy()
        p[actual_key] = float(v)
        eff = p["electrolyzer_eff"]
        eff = eff / 100 if eff > 1 else eff
        fv = build_feature_vector(
            p["solar_kw"], p["wind_kw"], eff,
            p["operating_hours"], p["water_avail"],
            p["ambient_temp_c"], p["electricity_price"], p["elz_type"],
        )
        pred = float(model.predict([fv])[0])
        points.append({"x": round(float(v), 3), "y": round(pred, 3)})

    return jsonify({"param": param, "points": points})


@ml_bp.route("/info", methods=["GET"])
def api_info():
    """Return model metadata and feature ranges."""
    return jsonify({
        "loaded": model is not None,
        "feature_info": feature_info,
        "elz_types": list(ELZ_SPECS.keys()),
    })


@ml_bp.route("/reload", methods=["GET"])
def api_reload():
    """Hot-reload model from disk (dev convenience)."""
    _load()
    return jsonify({"ok": True, "loaded": model is not None})

#%% Run standalone
if __name__ == "__main__":
    app = Flask(__name__)
    app.register_blueprint(ml_bp, url_prefix="/api/ml")
    print("Running ML API on http://localhost:5002")
    app.run(debug=True, port=5002)