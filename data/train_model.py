"""
Inputs
------
solar_kw: Solar PV capacity (kW)
wind_kw: Wind turbine capacity (kW)
electrolyzer_eff: Electrolyzer efficiency fraction (0-1)
operating_hours: Operating hours per day (0-24)
water_availability: Relative water supply (0-1, 1 = fully available)
ambient_temp_c: Ambient temperature (°C)
electricity_price: Grid electricity price (USD/kWh)

Output
------
h2_output_kg_day: Predicted daily hydrogen production (kg/day)

Physics basis
-------------
Electrolysis energy: ~39.4 kWh/kg H₂ (HHV)
Energy available: f(solar, wind, capacity factor, grid availability)
Temp derating: PEM ~-0.5%/°C above 40°C; Alkaline ~-0.3%/°C above 60°C
Water derating: linear reduction below 0.8 availability
Low-load derating: below minimum turndown (7-25% of rated)

Run
---
python train_model.py
Outputs: model.pkl  feature_info.json  training_report.txt
"""

# %% Imports
import json
import re
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, cross_val_score, KFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore")
np.random.seed(42)


# %% Paths 
HERE      = Path(__file__).parent
DATA_DIR  = HERE / "data"
MODEL_OUT = HERE / "model.pkl"
INFO_OUT  = HERE / "feature_info.json"
PLOT_OUT  = HERE / "training_report.png"

# %% Parse real electrolyzer specs from CSV
def _first_num(val):
    m = re.search(r"-?[\d]+\.?[\d]*", str(val).replace(",", ""))
    return float(m.group()) if m else None

def _nm3h(val):
    s = str(val)
    m = re.search(r"([\d,]+\.?\d*)\s*Nm.3/hr", s)
    if m: return float(m.group(1).replace(",",""))
    m = re.search(r"([\d,]+\.?\d*)\s*kg/hr", s)
    if m: return float(m.group(1).replace(",","")) / 0.08988  # kg→Nm³
    return _first_num(val)

def _kwh_nm3(val):
    """Parse power consumption in kWh/Nm³."""
    s = str(val)
    # Already in kWh/Nm³
    m = re.search(r"([\d.]+)\s*kWh/Nm", s)
    if m: return float(m.group(1))
    # Given in kWh/kg → divide by 11.126 (Nm³ per kg)
    m = re.search(r"([\d.]+)\s*kWh/kg", s)
    if m: return float(m.group(1)) / 11.126
    # Given in MW → need rated output to derive
    m = re.search(r"([\d.]+)\s*MW", s)
    if m: return None   # handled separately
    return _first_num(val)

def load_electrolyzer_specs(csv_path: Path) -> pd.DataFrame:
    """Returns DataFrame with columns: type, kwh_per_nm3, rated_nm3h, temp_min, temp_max"""
    df = pd.read_csv(csv_path, dtype=str).fillna("-")
    rows = []
    for _, r in df.iterrows():
        mfr = str(r.get("Manufacturer","")).strip()
        if not mfr or mfr in ("-","nan"): continue
        elz_type_raw = str(r.get("Electrolyzer Type","")).upper()
        if "KOH" in elz_type_raw or "ALK" in elz_type_raw:
            elz_type = "Alkaline"
        elif "PEM" in elz_type_raw:
            elz_type = "PEM"
        elif "SOE" in elz_type_raw:
            elz_type = "SOEC"
        else:
            elz_type = "PEM"

        kwh_nm3 = _kwh_nm3(r.get("Power Consumption",""))
        nm3h    = _nm3h(r.get("Hydrogen Production Rate",""))
        temp_min = _first_num(str(r.get("Minimum Environmental Temperature ","")).replace("C","").split("(")[0])
        temp_max = _first_num(str(r.get("Maximum Environmental Temperature","")).replace("C","").split("(")[0])

        if kwh_nm3 and nm3h:
            rows.append({"type": elz_type, "kwh_per_nm3": kwh_nm3,
                         "rated_nm3h": nm3h, "temp_min": temp_min, "temp_max": temp_max})

    print(f"Loaded {len(rows)} electrolyzer specs from {csv_path}")
    return pd.DataFrame(rows)

# %% Synthetic data generator
HHV_KWH_PER_KG_H2     = 39.4    # kWh/kg H₂ higher heating value
KG_PER_NM3_H2          = 0.08988 # kg/Nm³ at STP
KWH_PER_NM3_IDEAL      = HHV_KWH_PER_KG_H2 * KG_PER_NM3_H2   # = 3.54 kWh/Nm³

# kWh/Nm³ by type
ELZ_SPECS = {
    "PEM":      {"kwh_nm3_base": 5.2,  "temp_derate_start": 40, "temp_coeff": -0.005, "turndown_min": 0.10},
    "Alkaline": {"kwh_nm3_base": 4.5,  "temp_derate_start": 60, "temp_coeff": -0.003, "turndown_min": 0.20},
    "SOEC":     {"kwh_nm3_base": 3.7,  "temp_derate_start": 850,"temp_coeff": -0.008, "turndown_min": 0.25},
}

def compute_h2_output(
    solar_kw:           float,
    wind_kw:            float,
    electrolyzer_eff:   float,   # 0.60-0.95
    operating_hours:    float,   # 0-24
    water_avail:        float,   # 0-1
    ambient_temp_c:     float,   # -30-50
    electricity_price:  float,   # USD/kWh (affects grid use / curtailment)
    elz_type:           str = "PEM",
    solar_cf:           float = None,   # capacity factor (sampled if None)
    wind_cf:            float = None,
    noise_scale:        float = 0.04,   # ± noise fraction
) -> float:
    """
    H₂ production model (kg/day).
    
    Energy pathway:
      available_power = solar × solar_CF + wind × wind_CF
      effective_power = available_power × (grid_supplement if cheap electricity)
      h2_nm3h = effective_power / (kwh_per_nm3 / electrolyzer_eff)
      apply deratings: temp, water, turndown, operating hours
      h2_kg_day = h2_nm3h × kg_per_nm3 × operating_hours
    """
    specs = ELZ_SPECS.get(elz_type, ELZ_SPECS["PEM"])

    # Capacity factors (realistic distributions)
    if solar_cf is None:
        solar_cf = np.clip(np.random.beta(2, 4) * 0.5 + 0.05, 0.05, 0.55)
    if wind_cf is None:
        wind_cf  = np.clip(np.random.beta(2.5, 3) * 0.5 + 0.15, 0.10, 0.60)

    # Available renewable power (kW)
    renewable_kw = solar_kw * solar_cf + wind_kw * wind_cf

    # Grid supplement: if electricity is cheap, buy more
    grid_supplement_kw = 0.0
    if electricity_price < 0.05:
        grid_supplement_kw = renewable_kw * np.random.uniform(0.1, 0.5)
    elif electricity_price > 0.15:
        grid_supplement_kw = 0.0   # curtail, don't buy

    available_kw = renewable_kw + grid_supplement_kw

    # Effective kWh/Nm³ (actual energy per unit H₂ accounting for stack efficiency)
    # Lower efficiency → more energy needed per Nm³
    kwh_nm3_actual = specs["kwh_nm3_base"] / max(electrolyzer_eff, 0.01)

    # Hourly H₂ rate before deratings
    h2_nm3h_raw = available_kw / kwh_nm3_actual if kwh_nm3_actual > 0 else 0

    # ── Derating factors ──────────────────────────────────────────────────────

    # 1. Temperature derating
    temp_limit = specs["temp_derate_start"]
    if ambient_temp_c > temp_limit:
        temp_derate = 1.0 + specs["temp_coeff"] * (ambient_temp_c - temp_limit)
        temp_derate = max(temp_derate, 0.50)   # floor at 50%
    elif ambient_temp_c < -10:
        # Cold startup penalty
        temp_derate = 1.0 - 0.002 * abs(ambient_temp_c + 10)
        temp_derate = max(temp_derate, 0.80)
    else:
        temp_derate = 1.0

    # 2. Water availability derating (linear below 80%)
    water_derate = 1.0 if water_avail >= 0.8 else (water_avail / 0.8)
    water_derate = max(water_derate, 0.0)

    # 3. Turndown derating: below minimum, electrolyzer shuts down or reduces output
    turndown_min = specs["turndown_min"]
    #   Fraction of rated load being demanded
    #   We model rated load as what full renewable + reasonable grid would supply
    max_conceivable_kw = (solar_kw + wind_kw) * 0.5 + 100   # rough ceiling
    load_fraction = available_kw / max(max_conceivable_kw, 1)
    if load_fraction < turndown_min:
        # Below minimum: partial output proportional
        turndown_derate = load_fraction / turndown_min * 0.8
    else:
        turndown_derate = 1.0

    # 4. Operating hours effect (longer = more thermal cycling losses at extremes)
    if operating_hours > 22:
        hours_derate = 0.97   # minimal downtime
    elif operating_hours < 4:
        hours_derate = 0.90   # frequent cold starts
    else:
        hours_derate = 1.0

    # ── Final output ──────────────────────────────────────────────────────────
    h2_nm3h = h2_nm3h_raw * temp_derate * water_derate * turndown_derate * hours_derate
    h2_kg_day = h2_nm3h * KG_PER_NM3_H2 * operating_hours

    # Realistic physical noise (sensor error, intermittency, etc.)
    noise = np.random.normal(1.0, noise_scale)
    h2_kg_day = max(h2_kg_day * noise, 0.0)

    return h2_kg_day

# %% Generate synthetic dataset
def generate_dataset(n_samples: int = 40_000) -> pd.DataFrame:
    """
    Generate physics-informed synthetic training data.
    Samples cover residential (1-50 kW) through industrial (1-50 MW) scales.
    """
    print(f"Generating {n_samples:,} synthetic samples…")

    # Scale mix: 60% small (<100 kW), 30% mid (100-5000 kW), 10% large (>5000 kW)
    scale_choice = np.random.choice(["small","mid","large"], size=n_samples,
                                     p=[0.60, 0.30, 0.10])

    solar_kw = np.where(scale_choice=="small",
                        np.random.uniform(1, 100, n_samples),
               np.where(scale_choice=="mid",
                        np.random.uniform(100, 5000, n_samples),
                        np.random.uniform(5000, 100_000, n_samples)))

    wind_kw  = np.where(scale_choice=="small",
                        np.random.uniform(0, 50, n_samples),
               np.where(scale_choice=="mid",
                        np.random.uniform(0, 3000, n_samples),
                        np.random.uniform(0, 50_000, n_samples)))

    elz_types = np.random.choice(["PEM","Alkaline","SOEC"], size=n_samples,
                                  p=[0.55, 0.35, 0.10])

    # Efficiency: PEM 65-85%, Alkaline 60-80%, SOEC 75-92%
    eff_ranges = {"PEM": (0.65, 0.85), "Alkaline": (0.60, 0.80), "SOEC": (0.75, 0.92)}
    electrolyzer_eff = np.array([
        np.random.uniform(*eff_ranges[t]) for t in elz_types
    ])

    operating_hours    = np.random.uniform(1, 24, n_samples)
    water_availability = np.random.beta(5, 1.5, n_samples).clip(0.1, 1.0)
    ambient_temp_c     = np.random.uniform(-25, 50, n_samples)
    electricity_price  = np.random.uniform(0.01, 0.30, n_samples)

    rows = []
    for i in range(n_samples):
        h2 = compute_h2_output(
            solar_kw[i], wind_kw[i], electrolyzer_eff[i],
            operating_hours[i], water_availability[i],
            ambient_temp_c[i], electricity_price[i],
            elz_type=elz_types[i],
        )
        rows.append({
            "solar_kw":          solar_kw[i],
            "wind_kw":           wind_kw[i],
            "total_renewable_kw": solar_kw[i] + wind_kw[i],
            "electrolyzer_eff":  electrolyzer_eff[i],
            "operating_hours":   operating_hours[i],
            "water_availability": water_availability[i],
            "ambient_temp_c":    ambient_temp_c[i],
            "electricity_price": electricity_price[i],
            "elz_type_pem":      1 if elz_types[i] == "PEM" else 0,
            "elz_type_alkaline": 1 if elz_types[i] == "Alkaline" else 0,
            "elz_type_soec":     1 if elz_types[i] == "SOEC" else 0,
            # Engineered features
            "renewable_x_eff":   (solar_kw[i] + wind_kw[i]) * electrolyzer_eff[i],
            "solar_fraction":    solar_kw[i] / max(solar_kw[i] + wind_kw[i], 0.001),
            "h2_output_kg_day":  h2,
        })

    df = pd.DataFrame(rows)
    print(f"  Range: {df['h2_output_kg_day'].min():.2f} - {df['h2_output_kg_day'].max():.2f} kg/day")
    print(f"  Mean:  {df['h2_output_kg_day'].mean():.2f} kg/day")
    return df


#%% Feature config
BASE_FEATURES = [
    "solar_kw",
    "wind_kw",
    "total_renewable_kw",
    "electrolyzer_eff",
    "operating_hours",
    "water_availability",
    "ambient_temp_c",
    "electricity_price",
    "elz_type_pem",
    "elz_type_alkaline",
    "elz_type_soec",
    "renewable_x_eff",
    "solar_fraction",
]
TARGET = "h2_output_kg_day"

#%% Train
def train_model(df: pd.DataFrame):
    X = df[BASE_FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )
    print(f"\nTrain: {len(X_train):,}  Test: {len(X_test):,}")

    # ── Model: Gradient Boosting (best bias-variance for this physics problem)
    model = GradientBoostingRegressor(
        n_estimators    = 600,
        learning_rate   = 0.05,
        max_depth       = 5,
        min_samples_leaf= 10,
        subsample       = 0.8,
        max_features    = "sqrt",
        loss            = "huber",
        alpha           = 0.95,
        random_state    = 42,
        verbose         = 0,
    )

    print("Training Gradient Boosting…")
    model.fit(X_train, y_train)

    # ── Evaluate ──────────────────────────────────────────────────────────────
    y_pred = model.predict(X_test)
    mae    = mean_absolute_error(y_test, y_pred)
    rmse   = mean_squared_error(y_test, y_pred) ** 0.5
    r2     = r2_score(y_test, y_pred)
    mape   = np.mean(np.abs((y_test - y_pred) / np.clip(y_test, 1, None))) * 100

    print(f"\n── Test metrics ──────────────────────────────")
    print(f"  MAE  : {mae:.2f} kg/day")
    print(f"  RMSE : {rmse:.2f} kg/day")
    print(f"  R²   : {r2:.4f}")
    print(f"  MAPE : {mape:.2f}%")

    # 5-fold CV R²
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring="r2")
    print(f"\n  CV R² (5-fold): {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # ── Feature importance ────────────────────────────────────────────────────
    fi = pd.Series(model.feature_importances_, index=BASE_FEATURES).sort_values(ascending=False)
    print(f"\n── Feature importances ───────────────────────")
    for feat, imp in fi.items():
        bar = "█" * int(imp * 60)
        print(f"  {feat:<25s} {imp:.4f}  {bar}")

    # ── Plots ─────────────────────────────────────────────────────────────────
    fig = plt.figure(figsize=(16, 10), facecolor="#f0eee7")
    gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.40, wspace=0.38)

    BLUE  = "#2c5f7a"
    BLUE2 = "#7aaecc"
    BEIGE = "#f0eee7"
    INK   = "#1e1e1e"

    for ax in fig.get_axes():
        ax.set_facecolor(BEIGE)

    def styled_ax(ax, title):
        ax.set_facecolor("#ffffff")
        ax.set_title(title, fontsize=11, color=INK, pad=8, fontweight="bold")
        ax.tick_params(colors=INK, labelsize=9)
        for spine in ax.spines.values():
            spine.set_edgecolor("#cccccc")
        ax.grid(True, color="#e0ddd6", linewidth=0.6, linestyle="--")

    # 1. Actual vs Predicted
    ax1 = fig.add_subplot(gs[0, 0])
    sample_idx = np.random.choice(len(y_test), min(2000, len(y_test)), replace=False)
    ax1.scatter(y_test.iloc[sample_idx], y_pred[sample_idx], alpha=0.25, s=8, color=BLUE2)
    lim = max(y_test.max(), y_pred.max()) * 1.05
    ax1.plot([0, lim], [0, lim], color=BLUE, linewidth=1.5, linestyle="--")
    ax1.set(xlabel="Actual (kg/day)", ylabel="Predicted (kg/day)")
    styled_ax(ax1, f"Actual vs Predicted  (R²={r2:.3f})")

    # 2. Residuals
    ax2 = fig.add_subplot(gs[0, 1])
    resid = y_pred - y_test.values
    ax2.scatter(y_pred[sample_idx], resid[sample_idx], alpha=0.2, s=8, color=BLUE2)
    ax2.axhline(0, color=BLUE, linewidth=1.5, linestyle="--")
    ax2.set(xlabel="Predicted (kg/day)", ylabel="Residual (kg/day)")
    styled_ax(ax2, f"Residuals  (RMSE={rmse:.1f})")

    # 3. Feature importance
    ax3 = fig.add_subplot(gs[0, 2])
    top_fi = fi.head(10)
    clean_labels = [f.replace("_", " ").replace("elz type ", "").title() for f in top_fi.index]
    bars = ax3.barh(clean_labels[::-1], top_fi.values[::-1], color=BLUE, alpha=0.85)
    ax3.set(xlabel="Importance")
    styled_ax(ax3, "Feature Importance (Top 10)")

    # 4. Predicted distribution
    ax4 = fig.add_subplot(gs[1, 0])
    ax4.hist(y_pred, bins=60, color=BLUE2, alpha=0.7, edgecolor="white", linewidth=0.3)
    ax4.hist(y_test, bins=60, color=BLUE,  alpha=0.4, edgecolor="white", linewidth=0.3)
    ax4.set(xlabel="H₂ output (kg/day)", ylabel="Count")
    ax4.legend(["Predicted", "Actual"], fontsize=8)
    styled_ax(ax4, "Output Distribution")

    # 5. Solar kW vs H₂ output (partial dependence proxy)
    ax5 = fig.add_subplot(gs[1, 1])
    solar_vals = np.linspace(0, 500, 120)
    pd_y = []
    baseline = X_test.mean()
    for s in solar_vals:
        row = baseline.copy()
        row["solar_kw"] = s
        row["total_renewable_kw"] = s + baseline["wind_kw"]
        row["renewable_x_eff"] = row["total_renewable_kw"] * row["electrolyzer_eff"]
        row["solar_fraction"] = s / max(row["total_renewable_kw"], 0.001)
        pd_y.append(model.predict([row.values])[0])
    ax5.plot(solar_vals, pd_y, color=BLUE, linewidth=2)
    ax5.set(xlabel="Solar capacity (kW)", ylabel="H₂ output (kg/day)")
    styled_ax(ax5, "Partial Dependence: Solar Capacity")

    # 6. Efficiency vs H₂ output
    ax6 = fig.add_subplot(gs[1, 2])
    eff_vals = np.linspace(0.60, 0.95, 80)
    pd_eff = []
    for e in eff_vals:
        row = baseline.copy()
        row["electrolyzer_eff"] = e
        row["renewable_x_eff"] = row["total_renewable_kw"] * e
        pd_eff.append(model.predict([row.values])[0])
    ax6.plot(eff_vals * 100, pd_eff, color=BLUE, linewidth=2)
    ax6.set(xlabel="Electrolyzer efficiency (%)", ylabel="H₂ output (kg/day)")
    styled_ax(ax6, "Partial Dependence: Efficiency")

    fig.suptitle(
        "Project Evergreen — H₂ Output Prediction Model",
        fontsize=14, color=INK, fontweight="bold", y=0.98
    )
    plt.savefig(PLOT_OUT, dpi=140, bbox_inches="tight", facecolor=BEIGE)
    print(f"\n  Plot saved → {PLOT_OUT}")

    # ── Save metrics for report ───────────────────────────────────────────────
    report = {
        "mae_kg_day":       round(mae,   2),
        "rmse_kg_day":      round(rmse,  2),
        "r2":               round(r2,    4),
        "mape_pct":         round(mape,  2),
        "cv_r2_mean":       round(float(cv_scores.mean()), 4),
        "cv_r2_std":        round(float(cv_scores.std()),  4),
        "n_train":          len(X_train),
        "n_test":           len(X_test),
        "feature_importance": {k: round(float(v), 4) for k, v in fi.items()},
    }

    return model, report, X_test, y_test, y_pred


#%% Prediction API
def build_feature_vector(
    solar_kw: float,
    wind_kw:  float,
    electrolyzer_eff: float,
    operating_hours:  float,
    water_availability: float,
    ambient_temp_c: float,
    electricity_price: float,
    elz_type: str = "PEM",
) -> list:
    """
    Convert user inputs → feature vector for model.predict().
    Call this from Flask or any Python backend.
    """
    total_kw = solar_kw + wind_kw
    return [
        solar_kw,
        wind_kw,
        total_kw,
        electrolyzer_eff,
        operating_hours,
        water_availability,
        ambient_temp_c,
        electricity_price,
        1 if elz_type == "PEM"      else 0,
        1 if elz_type == "Alkaline" else 0,
        1 if elz_type == "SOEC"     else 0,
        total_kw * electrolyzer_eff,
        solar_kw / max(total_kw, 0.001),
    ]


def predict_h2(model, solar_kw, wind_kw, electrolyzer_eff,
               operating_hours, water_availability, ambient_temp_c,
               electricity_price, elz_type="PEM") -> dict:
    """
    Full prediction with confidence interval (±1 std from tree ensemble).
    Returns: {h2_kg_day, h2_nm3_day, confidence_low, confidence_high, daily_energy_kwh}
    """
    fv = build_feature_vector(
        solar_kw, wind_kw, electrolyzer_eff, operating_hours,
        water_availability, ambient_temp_c, electricity_price, elz_type,
    )
    pred_kg_day = float(model.predict([fv])[0])

    # Approximate CI using staged predictions variance
    stage_preds = np.array([
        est.predict([fv])[0]
        for est in model.estimators_[:, 0][::10]  # every 10th tree
    ])
    ci_half = float(np.std(stage_preds)) * 1.5

    # Derived metrics
    kwh_per_kg = ELZ_SPECS.get(elz_type, ELZ_SPECS["PEM"])["kwh_nm3_base"] / (
        electrolyzer_eff * KG_PER_NM3_H2
    )
    daily_energy_kwh = pred_kg_day * kwh_per_kg

    return {
        "h2_kg_day":        round(pred_kg_day, 3),
        "h2_nm3_day":       round(pred_kg_day / KG_PER_NM3_H2, 2),
        "confidence_low":   round(max(pred_kg_day - ci_half, 0), 3),
        "confidence_high":  round(pred_kg_day + ci_half, 3),
        "daily_energy_kwh": round(daily_energy_kwh, 1),
        "co2_avoided_kg":   round(pred_kg_day * 8.9, 1),  # 8.9 kg CO₂/kg H₂ displaced
    }


# %% Recommendation engine 
def recommend_components(model, solar_kw, wind_kw, water_avail,
                         ambient_temp_c, electricity_price,
                         operating_hours, electrolyzer_csv_path: Path,
                         top_n=5) -> list[dict]:
    """
    Given site parameters, score every electrolyzer in the DB by predicted
    output and return ranked recommendations with explanations.
    """
    specs_df = load_electrolyzer_specs(electrolyzer_csv_path)
    if specs_df.empty:
        return []

    results = []
    for _, row in specs_df.iterrows():
        eff = min(KWH_PER_NM3_IDEAL / row["kwh_per_nm3"], 0.95)   # implied efficiency
        pred = predict_h2(
            model, solar_kw, wind_kw, eff, operating_hours,
            water_avail, ambient_temp_c, electricity_price,
            elz_type=row["type"],
        )

        # Penalty: if rated output < predicted demand, partial score
        # (can't produce more than rated capacity)
        rated_kg_day = row["rated_nm3h"] * KG_PER_NM3_H2 * operating_hours
        bottleneck   = rated_kg_day < pred["h2_kg_day"]
        actual_kg    = min(pred["h2_kg_day"], rated_kg_day)

        # Explain why this electrolyzer was recommended
        reasons = []
        if eff > 0.80:
            reasons.append("high electrical efficiency")
        if row["type"] == "SOEC":
            reasons.append("best efficiency at high temp (SOEC)")
        if row.get("temp_min") and ambient_temp_c < 0 and row["temp_min"] <= ambient_temp_c:
            reasons.append("rated for cold climate operation")
        elif row.get("temp_min") and ambient_temp_c < 0 and (row["temp_min"] or 0) > ambient_temp_c:
            reasons.append("⚠ below minimum operating temp")
        if not bottleneck:
            reasons.append("capacity matches predicted demand")
        else:
            reasons.append(f"⚠ rated output ({rated_kg_day:.0f} kg/day) below predicted demand")

        results.append({
            "type":             row["type"],
            "kwh_per_nm3":      row["kwh_per_nm3"],
            "rated_nm3h":       row["rated_nm3h"],
            "implied_eff":      round(eff, 3),
            "predicted_kg_day": round(actual_kg, 2),
            "confidence_low":   pred["confidence_low"],
            "confidence_high":  pred["confidence_high"],
            "bottleneck":       bottleneck,
            "reasons":          reasons,
        })

    results.sort(key=lambda x: x["predicted_kg_day"], reverse=True)
    return results[:top_n]


# %% Main 
if __name__ == "__main__":
    print("═" * 54)
    print("  Project Evergreen — H₂ Output Model Training")
    print("═" * 54)

    # 1. Generate data
    df = generate_dataset(n_samples=40_000)
    df.to_csv(HERE / "training_data.csv", index=False)
    print(f"  Saved training_data.csv ({len(df):,} rows)")

    # 2. Train
    model, report, X_test, y_test, y_pred = train_model(df)

    # 3. Save model + metadata
    joblib.dump(model, MODEL_OUT, compress=3)
    print(f"\n  Model saved → {MODEL_OUT}")

    feature_info = {
        "features": BASE_FEATURES,
        "target":   TARGET,
        "elz_types": ["PEM", "Alkaline", "SOEC"],
        "metrics":  report,
        "input_ranges": {
            "solar_kw":           [0, 100_000],
            "wind_kw":            [0, 50_000],
            "electrolyzer_eff":   [0.60, 0.95],
            "operating_hours":    [0, 24],
            "water_availability": [0, 1],
            "ambient_temp_c":     [-30, 50],
            "electricity_price":  [0.01, 0.40],
        },
    }
    with open(INFO_OUT, "w") as f:
        json.dump(feature_info, f, indent=2)
    print(f"  Feature info → {INFO_OUT}")

    # 4. Quick demo prediction
    print("\n── Demo prediction ─────────────────────────────")
    demo = predict_h2(
        model,
        solar_kw=50, wind_kw=20, electrolyzer_eff=0.78,
        operating_hours=18, water_availability=0.9,
        ambient_temp_c=22, electricity_price=0.08,
        elz_type="PEM",
    )
    print(f"  Input:  50 kW solar + 20 kW wind, PEM 78%, 18h/day, 22°C, $0.08/kWh")
    print(f"  Output: {demo['h2_kg_day']} kg/day  ({demo['h2_nm3_day']} Nm³/day)")
    print(f"  Range:  {demo['confidence_low']} - {demo['confidence_high']} kg/day")
    print(f"  Energy: {demo['daily_energy_kwh']} kWh/day")
    print(f"  CO₂:    {demo['co2_avoided_kg']} kg/day avoided")

    # 5. Recommendation demo
    csv_path = Path("data/electrolyzers.csv")
    if csv_path.exists():
        print("\n── Electrolyzer recommendations ────────────────")
        recs = recommend_components(
            model, solar_kw=50, wind_kw=20, water_avail=0.9,
            ambient_temp_c=22, electricity_price=0.08, operating_hours=18,
            electrolyzer_csv_path=csv_path,
        )
        for i, r in enumerate(recs, 1):
            print(f"  {i}. {r['type']:8s} | {r['predicted_kg_day']:6.1f} kg/day "
                  f"| eff {r['implied_eff']:.0%} | {', '.join(r['reasons'][:2])}")

    print("\n═" * 54)
    print("  Training complete.")
    print("═" * 54)