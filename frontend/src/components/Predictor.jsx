import { useState, useEffect, useCallback, useRef } from "react";
import "./predictor.css";

const API_BASE = "/predictor";

// ── safe fetch — never throws on bad JSON, always returns {ok, status, data, rawText} ──
async function safeFetch(url, options = {}) {
  let res, rawText;
  try {
    res     = await fetch(url, options);
    rawText = await res.text();
  } catch (networkErr) {
    return { ok: false, status: 0, data: null, rawText: "",
             error: `Network error: ${networkErr.message}` };
  }
  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    // Server returned HTML (catch-all served index.html) or a crash page
    const preview = rawText.slice(0, 120).replace(/\n/g, " ");
    return {
      ok: false, status: res.status, data: null, rawText,
      error: res.status === 404
        ? `API route ${url} not found (404). Is the ml_bp Blueprint registered in app.py?`
        : res.status >= 500
        ? `Server error ${res.status}. Check Render logs — Flask may have crashed on startup.`
        : `Expected JSON but got HTML. The /api/ml routes are not registered.\n\nGot: ${preview}`,
    };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data,
             error: data?.error ?? `HTTP ${res.status}` };
  }
  return { ok: true, status: res.status, data, error: null };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const INPUTS = [
  { key: "solar_kw",          label: "Solar Capacity",        unit: "kW",    min: 0,   max: 10000, step: 10,  default: 50,  desc: "Total installed solar PV capacity",                 },
  { key: "wind_kw",           label: "Wind Capacity",         unit: "kW",    min: 0,   max: 5000,  step: 5,   default: 20,  desc: "Total installed wind turbine capacity",             },
  { key: "electrolyzer_eff",  label: "Electrolyzer Efficiency",unit: "%",    min: 60,  max: 95,    step: 1,   default: 78,  desc: "Stack electrical-to-hydrogen efficiency", isPercent: true },
  { key: "operating_hours",   label: "Operating Hours",       unit: "h/day", min: 1,   max: 24,    step: 0.5, default: 18,  desc: "Hours per day the electrolyzer runs",               },
  { key: "water_availability",label: "Water Availability",    unit: "%",     min: 10,  max: 100,   step: 5,   default: 90,   desc: "Relative feedwater supply (100 = fully available)", isPercent: true },
  { key: "ambient_temp_c",    label: "Ambient Temperature",   unit: "°C",    min: -30, max: 50,    step: 1,   default: 22,   desc: "Site ambient temperature",                          },
  { key: "electricity_price", label: "Grid Electricity Price",unit: "$/kWh", min: 0.01,max: 0.40,  step: 0.01,default: 0.08, desc: "Governs grid supplement and curtailment decisions", },
];

const ELZ_TYPES    = ["PEM", "Alkaline", "SOEC"];
const SWEEP_PARAMS = [
  { key: "solar_kw",           label: "Solar capacity (kW)",      range: [0, 500]         },
  { key: "wind_kw",            label: "Wind capacity (kW)",       range: [0, 200]         },
  { key: "electrolyzer_eff",   label: "Electrolyzer eff. (0–1)",  range: [0.60, 0.95]     },
  { key: "operating_hours",    label: "Operating hours (h/day)",  range: [1, 24]          },
  { key: "water_availability", label: "Water availability (0–1)", range: [0.1, 1.0]       },
  { key: "ambient_temp_c",     label: "Temperature (°C)",         range: [-20, 50]        },
  { key: "electricity_price",  label: "Electricity price ($/kWh)",range: [0.01, 0.35]     },
];

const SENS_LABELS = {
  solar_kw: "Solar capacity", wind_kw: "Wind capacity",
  electrolyzer_eff: "Electrolyzer eff.", operating_hours: "Operating hours",
  water_avail: "Water availability", water_availability: "Water availability",
  ambient_temp_c: "Ambient temp", electricity_price: "Electricity price",
};

function fmt(n, d = 1) {
  if (n == null) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Sensitivity bar ────────────────────────────────────────────────────────────
function SensBar({ label, value }) {
  if (value == null) return null;
  const pos   = value >= 0;
  const width = Math.min(Math.abs(value), 100);
  return (
    <div className="pr-sens-row">
      <span className="pr-sens-label">{label}</span>
      <div className="pr-sens-bar-wrap">
        <div className={`pr-sens-bar ${pos ? "pos" : "neg"}`} style={{ width: `${width}%` }} />
      </div>
      <span className={`pr-sens-val ${pos ? "pos" : "neg"}`}>{pos ? "+" : ""}{value}%</span>
    </div>
  );
}

// ── Canvas chart ──────────────────────────────────────────────────────────────
function MiniChart({ points, sweepLabel, loading }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !points?.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const P = { top: 16, right: 16, bottom: 36, left: 52 };
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMax = Math.max(...ys) * 1.1 || 1;
    const tx = x => P.left + ((x - xMin) / (xMax - xMin || 1)) * (W - P.left - P.right);
    const ty = y => H - P.bottom - (y / yMax) * (H - P.top - P.bottom);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#e6e2d8"; ctx.lineWidth = 0.8;
    for (let i = 0; i <= 4; i++) {
      const y = P.top + (i / 4) * (H - P.top - P.bottom);
      ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(W - P.right, y); ctx.stroke();
      ctx.fillStyle = "#9a9690"; ctx.font = "9px monospace"; ctx.textAlign = "right";
      ctx.fillText(fmt(yMax - (i / 4) * yMax, 0), P.left - 4, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = P.left + (i / 4) * (W - P.left - P.right);
      ctx.fillStyle = "#9a9690"; ctx.font = "9px monospace"; ctx.textAlign = "center";
      ctx.fillText(fmt(xMin + (i / 4) * (xMax - xMin), 1), x, H - P.bottom + 12);
    }

    const g = ctx.createLinearGradient(0, P.top, 0, H - P.bottom);
    g.addColorStop(0, "rgba(44,95,122,0.18)"); g.addColorStop(1, "rgba(44,95,122,0.02)");
    ctx.beginPath(); ctx.moveTo(tx(xs[0]), ty(0));
    points.forEach(p => ctx.lineTo(tx(p.x), ty(p.y)));
    ctx.lineTo(tx(xs[xs.length - 1]), ty(0)); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath(); ctx.strokeStyle = "#2c5f7a"; ctx.lineWidth = 2; ctx.lineJoin = "round";
    points.forEach((p, i) => i === 0 ? ctx.moveTo(tx(p.x), ty(p.y)) : ctx.lineTo(tx(p.x), ty(p.y)));
    ctx.stroke();

    ctx.fillStyle = "#5a5650"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(sweepLabel, W / 2, H - 4);
    ctx.save(); ctx.translate(10, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("kg H₂/day", 0, 0); ctx.restore();
  }, [points, sweepLabel]);

  return (
    <div className="pr-chart-wrap">
      {loading && <div className="pr-chart-loading">Calculating…</div>}
      <canvas ref={ref} width={420} height={180} className="pr-chart-canvas" />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Predictor({ buildComponents = {} }) {
  const buildElzEff  = buildComponents?.electrolyzer?.efficiency ?? null;
  const buildElzType = buildComponents?.electrolyzer?.type ?? "PEM";

  const [values, setValues]             = useState(() => {
    const d = {};
    INPUTS.forEach(inp => {
      d[inp.key] = inp.key === "electrolyzer_eff" && buildElzEff ? buildElzEff : inp.default;
    });
    return d;
  });
  const [elzType, setElzType]           = useState(buildElzType);
  const [result, setResult]             = useState(null);
  const [recs, setRecs]                 = useState(null);
  const [sweepParam, setSweepParam]     = useState("solar_kw");
  const [sweepPoints, setSweepPoints]   = useState(null);
  const [loading, setLoading]           = useState(false);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [error, setError]               = useState(null);
  const [apiStatus, setApiStatus]       = useState(null); // null | "ok" | "error"
  const [apiInfo, setApiInfo]           = useState(null);
  const [activeTab, setActiveTab]       = useState("predict");
  const debounceRef = useRef(null);

  // ── Health check on mount ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { ok, data, error: err } = await safeFetch(`${API_BASE}/info`);
      if (ok) {
        setApiStatus(data.loaded ? "ok" : "no_model");
        setApiInfo(data);
      } else {
        setApiStatus("error");
        setError(err);
      }
    })();
  }, []);

  const buildPayload = useCallback(() => {
    const p = { elz_type: elzType };
    INPUTS.forEach(inp => {
      let v = Number(values[inp.key]);
      if (inp.isPercent) v = v / 100;
      p[inp.key] = v;
    });
    return p;
  }, [values, elzType]);

  const runPredict = useCallback(async () => {
    if (apiStatus !== "ok") return;
    setLoading(true); setError(null);
    const { ok, data, error: err } = await safeFetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (ok) setResult(data);
    else     setError(err);
    setLoading(false);
  }, [buildPayload, apiStatus]);

  const runRecommend = useCallback(async () => {
    if (apiStatus !== "ok") return;
    setLoading(true); setError(null);
    const { ok, data, error: err } = await safeFetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildPayload(), top_n: 6 }),
    });
    if (ok) setRecs(data.recommendations);
    else     setError(err);
    setLoading(false);
  }, [buildPayload, apiStatus]);

  const runSweep = useCallback(async () => {
    if (apiStatus !== "ok") return;
    setSweepLoading(true);
    const param = SWEEP_PARAMS.find(p => p.key === sweepParam);
    const { ok, data } = await safeFetch(`${API_BASE}/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildPayload(), sweep_param: sweepParam,
                             sweep_range: param?.range ?? [0, 100], steps: 50 }),
    });
    setSweepPoints(ok ? data.points : []);
    setSweepLoading(false);
  }, [buildPayload, sweepParam, apiStatus]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (activeTab === "predict")   runPredict();
      if (activeTab === "sweep")     runSweep();
      if (activeTab === "recommend") runRecommend();
    }, 420);
    return () => clearTimeout(debounceRef.current);
  }, [values, elzType, activeTab, sweepParam, apiStatus]);

  const set = (key, val) => setValues(v => ({ ...v, [key]: val }));

  // ── Status banner ─────────────────────────────────────────────────────────
  const StatusBanner = () => {
    if (apiStatus === "ok") return null;
    if (apiStatus === null) return (
      <div className="pr-banner info">Connecting to prediction API…</div>
    );
    if (apiStatus === "no_model") return (
      <div className="pr-banner warn">
        <strong>model.pkl not found on server.</strong> Run <code>python train_model.py</code>,
        commit <code>model.pkl</code> to git, and redeploy.
      </div>
    );
  };

  return (
    <div className="pr-root">
      <div className="pr-header">
        <div>
          <h2 className="pr-title">H₂ Output Predictor</h2>
          <p className="pr-subtitle">
            ML model · Gradient Boosting · R² 0.916
            {apiInfo && (
              <span style={{marginLeft:10, color: apiInfo.loaded ? "#2c5f7a" : "#a05020"}}>
                {apiInfo.loaded ? "● Model loaded" : "● Model not loaded"}
              </span>
            )}
          </p>
        </div>
        <div className="pr-tabs">
          {[["predict","Predict"],["sweep","Sensitivity"],["recommend","Recommend"]].map(([id,label]) => (
            <button key={id} className={`pr-tab${activeTab===id?" active":""}`}
                    onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      <StatusBanner />

      <div className="pr-body">
        {/* ── Inputs ────────────────────────────────────────────────────── */}
        <div className="pr-inputs">
          <div className="pr-inputs-header">
            <span className="pr-section-label">System Parameters</span>
            <div className="pr-elz-type">
              {ELZ_TYPES.map(t => (
                <button key={t} className={`pr-type-btn${elzType===t?" active":""}`}
                        onClick={() => setElzType(t)}>{t}</button>
              ))}
            </div>
          </div>

          {INPUTS.map(inp => (
            <div key={inp.key} className="pr-input-row">
              <div className="pr-input-meta">
                <div>
                  <div className="pr-input-label">{inp.label}</div>
                  <div className="pr-input-desc">{inp.desc}</div>
                </div>
              </div>
              <div className="pr-input-controls">
                <input type="range" className="pr-slider"
                       min={inp.min} max={inp.max} step={inp.step} value={values[inp.key]}
                       onChange={e => set(inp.key, parseFloat(e.target.value))} />
                <div className="pr-input-value-wrap">
                  <input type="number" className="pr-number"
                         min={inp.min} max={inp.max} step={inp.step} value={values[inp.key]}
                         onChange={e => set(inp.key, parseFloat(e.target.value) || 0)} />
                  <span className="pr-unit">{inp.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Output ────────────────────────────────────────────────────── */}
        <div className="pr-output">
          {error && apiStatus === "ok" && (
            <div className="pr-error">⚠ {error}</div>
          )}

          {/* PREDICT */}
          {activeTab === "predict" && (
            <>
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

              {result && (
                <div className="pr-metrics">
                  {[
                    [fmt(result.h2_nm3_day, 0), "Nm³/day"],
                    [fmt(result.daily_energy_kwh, 0), "kWh/day"],
                    [fmt(result.co2_avoided_kg, 0), "kg CO₂ avoided"],
                    [fmt(result.h2_kg_day * 365 / 1000, 1), "t H₂/year"],
                  ].map(([v, l]) => (
                    <div key={l} className="pr-metric">
                      <div className="pr-metric-val">{v}</div>
                      <div className="pr-metric-label">{l}</div>
                    </div>
                  ))}
                </div>
              )}

              {result?.sensitivity && (
                <div className="pr-sens-block">
                  <div className="pr-section-label" style={{display:"block",marginBottom:12}}>
                    Input Sensitivity (% change per +20% input)
                  </div>
                  <div className="pr-sens-list">
                    {Object.entries(result.sensitivity)
                      .filter(([,v]) => v != null)
                      .sort(([,a],[,b]) => Math.abs(b) - Math.abs(a))
                      .map(([k, v]) => <SensBar key={k} label={SENS_LABELS[k] ?? k} value={v} />)
                    }
                  </div>
                </div>
              )}
            </>
          )}

          {/* SWEEP */}
          {activeTab === "sweep" && (
            <div className="pr-sweep-block">
              <div className="pr-section-label">Sweep Parameter</div>
              <select className="pr-sweep-select" value={sweepParam}
                      onChange={e => setSweepParam(e.target.value)}
                      style={{margin:"10px 0 6px",width:"100%",maxWidth:340}}>
                {SWEEP_PARAMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <p className="pr-sweep-desc">
                H₂ output as <strong>{SWEEP_PARAMS.find(p=>p.key===sweepParam)?.label}</strong> varies,
                all other inputs held fixed.
              </p>
              <MiniChart points={sweepPoints}
                         sweepLabel={SWEEP_PARAMS.find(p=>p.key===sweepParam)?.label ?? sweepParam}
                         loading={sweepLoading} />
              {sweepPoints?.length > 0 && (
                <div className="pr-sweep-stats">
                  <span>Min: <strong>{fmt(Math.min(...sweepPoints.map(p=>p.y)),1)} kg/day</strong></span>
                  <span>Max: <strong>{fmt(Math.max(...sweepPoints.map(p=>p.y)),1)} kg/day</strong></span>
                  <span>Range: <strong>{fmt(Math.max(...sweepPoints.map(p=>p.y))-Math.min(...sweepPoints.map(p=>p.y)),1)} kg/day</strong></span>
                </div>
              )}
            </div>
          )}

          {/* RECOMMEND */}
          {activeTab === "recommend" && (
            <div className="pr-recs-block">
              <div className="pr-section-label" style={{display:"block",marginBottom:8}}>
                Top electrolyzers for your site parameters
              </div>
              {loading && <div className="pr-recs-loading">Scoring electrolyzers…</div>}
              {recs?.map((r, i) => (
                <div key={i} className={`pr-rec-card${r.bottleneck ? " warning" : ""}`}>
                  <div className="pr-rec-top">
                    <div>
                      <span className="pr-rec-rank">#{i+1}</span>
                      <span className="pr-rec-type">{r.type}</span>
                      <span className="pr-rec-rated">{fmt(r.rated_nm3h, 0)} Nm³/h rated</span>
                    </div>
                    <div className="pr-rec-output">
                      {fmt(r.predicted_kg_day, 1)}<span className="pr-rec-unit"> kg/day</span>
                    </div>
                  </div>
                  <div className="pr-rec-bar-row">
                    <div className="pr-rec-bar-bg">
                      <div className="pr-rec-bar-fill"
                           style={{width:`${Math.min((r.predicted_kg_day/(recs[0]?.predicted_kg_day||1))*100,100)}%`}} />
                    </div>
                    <span className="pr-rec-eff">{Math.round(r.implied_eff*100)}% eff.</span>
                  </div>
                  <div className="pr-rec-reasons">
                    {r.reasons.map((reason,j) => (
                      <span key={j} className={`pr-rec-reason${reason.startsWith("⚠") ? " warn" : ""}`}>
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="pr-rec-ci">
                    Confidence: {fmt(r.confidence_low,1)} – {fmt(r.confidence_high,1)} kg/day
                  </div>
                </div>
              ))}
              {recs?.length === 0 && <div className="pr-recs-empty">No electrolyzers matched.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}