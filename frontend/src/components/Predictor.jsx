import { useState, useEffect, useCallback, useRef } from "react";
import "./predictor.css";

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE = "/api/ml";

const INPUTS = [
  {
    key:     "solar_kw",
    label:   "Solar Capacity",
    unit:    "kW",
    min:     0,
    max:     10000,
    step:    10,
    default: 50,
    desc:    "Total installed solar PV capacity",
  },
  {
    key:     "wind_kw",
    label:   "Wind Capacity",
    unit:    "kW",
    min:     0,
    max:     5000,
    step:    5,
    default: 20,
    desc:    "Total installed wind turbine capacity",
  },
  {
    key:     "electrolyzer_eff",
    label:   "Electrolyzer Efficiency",
    unit:    "%",
    min:     60,
    max:     95,
    step:    1,
    default: 78,
    desc:    "Stack electrical-to-hydrogen efficiency",
    isPercent: true,   // send as /100 to API
  },
  {
    key:     "operating_hours",
    label:   "Operating Hours",
    unit:    "h/day",
    min:     1,
    max:     24,
    step:    0.5,
    default: 18,
    desc:    "Hours per day the electrolyzer runs",
  },
  {
    key:     "water_availability",
    label:   "Water Availability",
    unit:    "%",
    min:     10,
    max:     100,
    step:    5,
    default: 90,
    desc:    "Relative feedwater supply (100 = fully available)",
    isPercent: true,
  },
  {
    key:     "ambient_temp_c",
    label:   "Ambient Temperature",
    unit:    "°C",
    min:     -30,
    max:     50,
    step:    1,
    default: 22,
    desc:    "Site ambient temperature",
  },
  {
    key:     "electricity_price",
    label:   "Grid Electricity Price",
    unit:    "$/kWh",
    min:     0.01,
    max:     0.40,
    step:    0.01,
    default: 0.08,
    desc:    "Governs grid supplement and curtailment decisions",
  },
];

const ELZ_TYPES = ["PEM", "Alkaline", "SOEC"];

const SWEEP_PARAMS = [
  { key: "solar_kw",           label: "Solar capacity (kW)",     range: [0, 500] },
  { key: "wind_kw",            label: "Wind capacity (kW)",      range: [0, 200] },
  { key: "electrolyzer_eff",   label: "Electrolyzer eff. (0–1)", range: [0.60, 0.95] },
  { key: "operating_hours",    label: "Operating hours (h/day)", range: [1, 24] },
  { key: "water_availability", label: "Water availability (0–1)",range: [0.1, 1.0] },
  { key: "ambient_temp_c",     label: "Temperature (°C)",        range: [-20, 50] },
  { key: "electricity_price",  label: "Electricity price ($/kWh)",range: [0.01, 0.35] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, decimals = 1) {
  if (n == null) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SensBar({ label, value }) {
  if (value == null) return null;
  const positive = value >= 0;
  const width = Math.min(Math.abs(value), 100);
  return (
    <div className="pr-sens-row">
      <span className="pr-sens-label">{label}</span>
      <div className="pr-sens-bar-wrap">
        <div
          className={`pr-sens-bar ${positive ? "pos" : "neg"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`pr-sens-val ${positive ? "pos" : "neg"}`}>
        {positive ? "+" : ""}{value}%
      </span>
    </div>
  );
}

function MiniChart({ points, sweepLabel, loading }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points?.length) return;
    const ctx    = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 16, right: 16, bottom: 36, left: 52 };

    const xs   = points.map(p => p.x);
    const ys   = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = 0,              yMax = Math.max(...ys) * 1.1 || 1;

    const toX = x => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right);
    const toY = y => H - PAD.bottom - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#e6e2d8";
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * (H - PAD.top - PAD.bottom);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      const val = yMax - (i / 4) * (yMax - yMin);
      ctx.fillStyle = "#9a9690";
      ctx.font = "9px 'Courier New'";
      ctx.textAlign = "right";
      ctx.fillText(fmt(val, 0), PAD.left - 4, y + 3);
    }

    // X axis labels
    ctx.fillStyle = "#9a9690";
    ctx.font = "9px 'Courier New'";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const x = PAD.left + (i / 4) * (W - PAD.left - PAD.right);
      const val = xMin + (i / 4) * (xMax - xMin);
      ctx.fillText(fmt(val, 1), x, H - PAD.bottom + 12);
    }

    // Area fill
    const gradient = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    gradient.addColorStop(0, "rgba(44,95,122,0.18)");
    gradient.addColorStop(1, "rgba(44,95,122,0.02)");
    ctx.beginPath();
    ctx.moveTo(toX(xs[0]), toY(0));
    points.forEach(p => ctx.lineTo(toX(p.x), toY(p.y)));
    ctx.lineTo(toX(xs[xs.length - 1]), toY(0));
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = "#2c5f7a";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(p.x), toY(p.y)) : ctx.lineTo(toX(p.x), toY(p.y)));
    ctx.stroke();

    // X label
    ctx.fillStyle = "#5a5650";
    ctx.font = "10px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(sweepLabel, W / 2, H - 4);

    // Y label
    ctx.save();
    ctx.translate(10, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("kg H₂/day", 0, 0);
    ctx.restore();
  }, [points, sweepLabel]);

  return (
    <div className="pr-chart-wrap">
      {loading && <div className="pr-chart-loading">Calculating…</div>}
      <canvas ref={canvasRef} width={420} height={180} className="pr-chart-canvas" />
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────
export default function Predictor({ buildComponents = {} }) {
  // Prefill electrolyzer efficiency from build if available
  const buildElzEff = buildComponents?.electrolyzer?.efficiency ?? null;

  const [values, setValues]           = useState(() => {
    const defaults = {};
    INPUTS.forEach(inp => {
      defaults[inp.key] = inp.key === "electrolyzer_eff" && buildElzEff
        ? buildElzEff
        : inp.default;
    });
    return defaults;
  });
  const [elzType, setElzType]         = useState(buildComponents?.electrolyzer?.type ?? "PEM");
  const [result, setResult]           = useState(null);
  const [recs, setRecs]               = useState(null);
  const [sweepParam, setSweepParam]   = useState("solar_kw");
  const [sweepPoints, setSweepPoints] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [error, setError]             = useState(null);
  const [activeTab, setActiveTab]     = useState("predict"); // "predict" | "sweep" | "recommend"
  const debounceRef = useRef(null);

  // ── API calls ─────────────────────────────────────────────────────────────
  const buildPayload = useCallback(() => {
    const payload = { elz_type: elzType };
    INPUTS.forEach(inp => {
      let v = Number(values[inp.key]);
      if (inp.isPercent && inp.key !== "ambient_temp_c") v = v / 100;
      payload[inp.key] = v;
    });
    return payload;
  }, [values, elzType]);

  const runPredict = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [buildPayload]);

  const runRecommend = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), top_n: 6 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecs(data.recommendations);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [buildPayload]);

  const runSweep = useCallback(async () => {
    setSweepLoading(true);
    const param = SWEEP_PARAMS.find(p => p.key === sweepParam);
    try {
      const res  = await fetch(`${API_BASE}/sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          sweep_param:  sweepParam,
          sweep_range:  param?.range ?? [0, 100],
          steps:        50,
        }),
      });
      const data = await res.json();
      setSweepPoints(data.points ?? []);
    } catch (e) {
      setSweepPoints([]);
    } finally {
      setSweepLoading(false);
    }
  }, [buildPayload, sweepParam]);

  // Debounce slider changes → auto-predict
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (activeTab === "predict")    runPredict();
      if (activeTab === "sweep")      runSweep();
      if (activeTab === "recommend")  runRecommend();
    }, 420);
    return () => clearTimeout(debounceRef.current);
  }, [values, elzType, activeTab, sweepParam]);

  const set = (key, val) => setValues(v => ({ ...v, [key]: val }));

  // ── UI ───────────────────────────────────────────────────────────────────
  const sensLabels = {
    solar_kw:           "Solar capacity",
    wind_kw:            "Wind capacity",
    electrolyzer_eff:   "Electrolyzer eff.",
    operating_hours:    "Operating hours",
    water_avail:        "Water availability",
    ambient_temp_c:     "Ambient temp",
    electricity_price:  "Electricity price",
  };

  return (
    <div className="pr-root">

      {/* Header */}
      <div className="pr-header">
        <div>
          <h2 className="pr-title">H₂ Output Predictor</h2>
          <p className="pr-subtitle">ML model trained on physics-informed synthetic data · Gradient Boosting · R² 0.916</p>
        </div>
        <div className="pr-tabs">
          {[["predict","Predict"],["sweep","Sensitivity"],["recommend","Recommend"]].map(([id,label]) => (
            <button key={id} className={`pr-tab${activeTab===id?" active":""}`} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pr-body">

        {/* ── Inputs ───────────────────────────────────────────────────── */}
        <div className="pr-inputs">
          <div className="pr-inputs-header">
            <span className="pr-section-label">System Parameters</span>

            {/* Electrolyzer type selector */}
            <div className="pr-elz-type">
              {ELZ_TYPES.map(t => (
                <button
                  key={t}
                  className={`pr-type-btn${elzType===t?" active":""}`}
                  onClick={() => setElzType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {INPUTS.map(inp => {
            const raw = values[inp.key];
            const displayVal = inp.isPercent && inp.key !== "ambient_temp_c"
              ? raw   // already in percent in state
              : raw;

            return (
              <div key={inp.key} className="pr-input-row">
                <div className="pr-input-meta">
                  <div>
                    <div className="pr-input-label">{inp.label}</div>
                    <div className="pr-input-desc">{inp.desc}</div>
                  </div>
                </div>
                <div className="pr-input-controls">
                  <input
                    type="range"
                    className="pr-slider"
                    min={inp.min}
                    max={inp.max}
                    step={inp.step}
                    value={raw}
                    onChange={e => set(inp.key, parseFloat(e.target.value))}
                  />
                  <div className="pr-input-value-wrap">
                    <input
                      type="number"
                      className="pr-number"
                      min={inp.min}
                      max={inp.max}
                      step={inp.step}
                      value={raw}
                      onChange={e => set(inp.key, parseFloat(e.target.value) || 0)}
                    />
                    <span className="pr-unit">{inp.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right panel ──────────────────────────────────────────────── */}
        <div className="pr-output">

          {error && (
            <div className="pr-error">
              ⚠ {error}
              {error.includes("Model not loaded") && (
                <span> Run <code>python train_model.py</code> first.</span>
              )}
            </div>
          )}

          {/* ── PREDICT tab ─────────────────────────────────────────────── */}
          {activeTab === "predict" && (
            <>
              {/* Primary output */}
              <div className={`pr-output-hero${loading ? " loading" : ""}`}>
                <div className="pr-output-label">Predicted Daily H₂ Output</div>
                <div className="pr-output-value">
                  {result ? fmt(result.h2_kg_day, 1) : "—"}
                  <span className="pr-output-unit">kg/day</span>
                </div>
                {result && (
                  <div className="pr-output-range">
                    {fmt(result.confidence_low, 1)} – {fmt(result.confidence_high, 1)} kg/day (confidence range)
                  </div>
                )}
              </div>

              {/* Secondary metrics */}
              {result && (
                <div className="pr-metrics">
                  <div className="pr-metric">
                    <div className="pr-metric-val">{fmt(result.h2_nm3_day, 0)}</div>
                    <div className="pr-metric-label">Nm³/day</div>
                  </div>
                  <div className="pr-metric">
                    <div className="pr-metric-val">{fmt(result.daily_energy_kwh, 0)}</div>
                    <div className="pr-metric-label">kWh/day</div>
                  </div>
                  <div className="pr-metric">
                    <div className="pr-metric-val">{fmt(result.co2_avoided_kg, 0)}</div>
                    <div className="pr-metric-label">kg CO₂ avoided</div>
                  </div>
                  <div className="pr-metric">
                    <div className="pr-metric-val">{fmt(result.h2_kg_day * 365 / 1000, 1)}</div>
                    <div className="pr-metric-label">t H₂/year</div>
                  </div>
                </div>
              )}

              {/* Sensitivity */}
              {result?.sensitivity && (
                <div className="pr-sens-block">
                  <div className="pr-section-label">Input Sensitivity (% change per +20%)</div>
                  <div className="pr-sens-list">
                    {Object.entries(result.sensitivity)
                      .filter(([,v]) => v != null)
                      .sort(([,a],[,b]) => Math.abs(b) - Math.abs(a))
                      .map(([k, v]) => (
                        <SensBar key={k} label={sensLabels[k] ?? k} value={v} />
                      ))
                    }
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SWEEP tab ───────────────────────────────────────────────── */}
          {activeTab === "sweep" && (
            <div className="pr-sweep-block">
              <div className="pr-section-label">Sweep Parameter</div>
              <div className="pr-sweep-select-row">
                <select
                  className="pr-sweep-select"
                  value={sweepParam}
                  onChange={e => setSweepParam(e.target.value)}
                >
                  {SWEEP_PARAMS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <p className="pr-sweep-desc">
                H₂ output as <strong>{SWEEP_PARAMS.find(p=>p.key===sweepParam)?.label}</strong> varies,
                all other inputs held fixed.
              </p>
              <MiniChart
                points={sweepPoints}
                sweepLabel={SWEEP_PARAMS.find(p=>p.key===sweepParam)?.label ?? sweepParam}
                loading={sweepLoading}
              />
              {sweepPoints?.length > 0 && (
                <div className="pr-sweep-stats">
                  <span>Min: <strong>{fmt(Math.min(...sweepPoints.map(p=>p.y)),1)} kg/day</strong></span>
                  <span>Max: <strong>{fmt(Math.max(...sweepPoints.map(p=>p.y)),1)} kg/day</strong></span>
                  <span>Range: <strong>{fmt(Math.max(...sweepPoints.map(p=>p.y)) - Math.min(...sweepPoints.map(p=>p.y)),1)} kg/day</strong></span>
                </div>
              )}
            </div>
          )}

          {/* ── RECOMMEND tab ───────────────────────────────────────────── */}
          {activeTab === "recommend" && (
            <div className="pr-recs-block">
              <div className="pr-section-label">
                Top electrolyzers for your site parameters
              </div>
              {loading && <div className="pr-recs-loading">Scoring electrolyzers…</div>}
              {recs && recs.map((r, i) => (
                <div key={i} className={`pr-rec-card${r.bottleneck ? " warning" : ""}`}>
                  <div className="pr-rec-top">
                    <div>
                      <span className="pr-rec-rank">#{i+1}</span>
                      <span className="pr-rec-type">{r.type}</span>
                      <span className="pr-rec-rated">{fmt(r.rated_nm3h, 0)} Nm³/h rated</span>
                    </div>
                    <div className="pr-rec-output">
                      {fmt(r.predicted_kg_day, 1)}
                      <span className="pr-rec-unit"> kg/day</span>
                    </div>
                  </div>
                  <div className="pr-rec-bar-row">
                    <div className="pr-rec-bar-bg">
                      <div
                        className="pr-rec-bar-fill"
                        style={{
                          width: `${Math.min((r.predicted_kg_day / (recs[0]?.predicted_kg_day || 1)) * 100, 100)}%`
                        }}
                      />
                    </div>
                    <span className="pr-rec-eff">{Math.round(r.implied_eff * 100)}% eff.</span>
                  </div>
                  <div className="pr-rec-reasons">
                    {r.reasons.map((reason, j) => (
                      <span key={j} className={`pr-rec-reason${reason.startsWith("⚠") ? " warn" : ""}`}>
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="pr-rec-ci">
                    Confidence range: {fmt(r.confidence_low, 1)} – {fmt(r.confidence_high, 1)} kg/day
                  </div>
                </div>
              ))}
              {recs && recs.length === 0 && (
                <div className="pr-recs-empty">No electrolyzers in database matched your parameters.</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}