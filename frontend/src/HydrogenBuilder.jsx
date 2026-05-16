import { useState, useMemo } from "react";
import "./builder.css";

// ── Data ──────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "electrolyzer", label: "Electrolyzer",      icon: "⚗️",  required: true  },
  { id: "rectifier",   label: "Rectifier / PSU",    icon: "🔌",  required: true  },
  { id: "storage",     label: "H₂ Storage Tank",    icon: "🫙",  required: true  },
  { id: "compressor",  label: "Compressor",          icon: "🔧",  required: true  },
  { id: "purifier",    label: "Purifier / Dryer",    icon: "💧",  required: false },
  { id: "fuelcell",    label: "Fuel Cell",           icon: "⚡",  required: false },
  { id: "sensor",      label: "Safety Sensors",      icon: "📡",  required: false },
  { id: "controller",  label: "System Controller",   icon: "🖥️",  required: false },
];

const PARTS = [
  { id: "e1", category: "electrolyzer", name: "ProtonEx PEM-5",       brand: "Proton Energy",      price: 4800,  power_kw: 5,   output_nm3h: 1.0, type: "PEM",      pressure_bar: 35,  weight_kg: 48,  efficiency: 78, tags: ["residential","compact"],        desc: "Compact PEM unit ideal for residential or lab use. Low maintenance, fast startup, produces 99.999% pure H₂." },
  { id: "e2", category: "electrolyzer", name: "AlkaFlex 30",          brand: "HydraTech",          price: 12500, power_kw: 30,  output_nm3h: 6.0, type: "Alkaline", pressure_bar: 30,  weight_kg: 210, efficiency: 72, tags: ["industrial","high-output"],     desc: "Industrial alkaline electrolyzer with proven 20-year lifespan. Lower capex per kW, best for constant-load operations." },
  { id: "e3", category: "electrolyzer", name: "SolidOx SOEC-20",      brand: "Elcogen",            price: 28000, power_kw: 20,  output_nm3h: 5.2, type: "SOEC",     pressure_bar: 15,  weight_kg: 95,  efficiency: 89, tags: ["high-efficiency","industrial"], desc: "Solid oxide electrolyzer operating at 800°C. Highest electrical efficiency available; ideal for waste-heat pairing." },
  { id: "e4", category: "electrolyzer", name: "NanoMem PEM-1",        brand: "ITM Power",          price: 1900,  power_kw: 1,   output_nm3h: 0.2, type: "PEM",      pressure_bar: 30,  weight_kg: 14,  efficiency: 76, tags: ["residential","entry-level"],    desc: "Entry-level PEM electrolyzer for hobbyists, researchers, and small-scale pilots. Plug-and-play design." },
  { id: "r1", category: "rectifier",   name: "RectPro 10kW",         brand: "AEG Power",          price: 1100,  power_kw: 10,  input_voltage: "3-phase 400V",   ripple_pct: 2,   efficiency: 95, weight_kg: 22,  tags: ["universal"],              desc: "High-efficiency switch-mode rectifier. Wide input range, soft-start protection, IGBT technology." },
  { id: "r2", category: "rectifier",   name: "SolarDC 5kW",          brand: "SMA",                price: 780,   power_kw: 5,   input_voltage: "PV 200-900V DC", ripple_pct: 1.5, efficiency: 97, weight_kg: 12,  tags: ["solar","residential"],    desc: "DC-DC converter optimized for direct PV-to-electrolyzer coupling. MPPT tracking built in." },
  { id: "r3", category: "rectifier",   name: "InduRect 35kW",        brand: "Schneider Electric", price: 3400,  power_kw: 35,  input_voltage: "3-phase 690V",   ripple_pct: 1,   efficiency: 96, weight_kg: 68,  tags: ["industrial"],             desc: "Heavy-duty industrial rectifier for alkaline and large PEM stacks. Includes thyristor bridge and active filtering." },
  { id: "s1", category: "storage",     name: "CompTank 200L / 350bar", brand: "Luxfer",            price: 3200,  capacity_nm3: 70,  pressure_bar: 350, material: "Carbon Fibre (Type IV)", weight_kg: 38,  tags: ["high-pressure","mobile"],   desc: "Lightweight Type IV carbon fibre cylinder. Ideal for on-site buffer storage or vehicle fueling." },
  { id: "s2", category: "storage",     name: "SteelVault 1000L / 200bar", brand: "Worthington",   price: 5900,  capacity_nm3: 200, pressure_bar: 200, material: "Steel (Type I)",          weight_kg: 420, tags: ["stationary","industrial"],  desc: "Robust steel pressure vessel for stationary industrial installations. Long service life, lower unit cost." },
  { id: "s3", category: "storage",     name: "MH Alloy Canister 5kg", brand: "McPhy",             price: 8400,  capacity_nm3: 55,  pressure_bar: 30,  material: "Metal Hydride",           weight_kg: 95,  tags: ["low-pressure","safe"],      desc: "Metal hydride storage at near-ambient pressure. Safest storage option; releases H₂ on gentle heating." },
  { id: "c1", category: "compressor",  name: "DiaphComp 35-350",      brand: "PDC Machines",       price: 6200,  input_bar: 35, output_bar: 350, flow_nm3h: 2, power_kw: 3.5, weight_kg: 180, tags: ["oil-free","high-pressure"], desc: "Diaphragm compressor, oil-free, zero contamination. Standard for fueling station cascade charging." },
  { id: "c2", category: "compressor",  name: "IonicLiquid 30-200",    brand: "Linde",              price: 9800,  input_bar: 30, output_bar: 200, flow_nm3h: 6, power_kw: 5.2, weight_kg: 240, tags: ["oil-free","low-noise"],     desc: "Ionic liquid piston compressor. Near-isothermal compression, extremely low noise, zero oil carryover." },
  { id: "c3", category: "compressor",  name: "RecipComp 10-30",       brand: "Bauer",              price: 2100,  input_bar: 10, output_bar: 30,  flow_nm3h: 5, power_kw: 2.2, weight_kg: 85,  tags: ["low-pressure","budget"],    desc: "Reciprocating single-stage compressor for low-pressure buffering. Cost-effective for alkaline system integration." },
  { id: "p1", category: "purifier",    name: "PdMembrane H₂-Pure 5",  brand: "Air Products",       price: 2200,  purity_pct: 99.9999, flow_nm3h: 5,  pressure_bar: 20, weight_kg: 18, tags: ["ultra-pure","fuel-cell-grade"], desc: "Palladium membrane purifier achieving 6N purity. Required for fuel cell and semiconductor applications." },
  { id: "p2", category: "purifier",    name: "PSA Dryer 10Nm³/h",     brand: "Generon",            price: 1400,  purity_pct: 99.999,  flow_nm3h: 10, pressure_bar: 8,  weight_kg: 42, tags: ["drying","general"],             desc: "Pressure swing adsorption dryer removes moisture and trace impurities. Suitable for most industrial applications." },
  { id: "f1", category: "fuelcell",    name: "PowerCell S3",          brand: "PowerCell Sweden",   price: 14500, power_kw: 125, type: "PEM",  weight_kg: 145, efficiency: 60, tags: ["transport","high-power"],  desc: "Heavy-duty PEM fuel cell module for truck, bus, or marine propulsion. Proven 10,000+ hour lifetime." },
  { id: "f2", category: "fuelcell",    name: "BluGen 5kW",            brand: "Bloom Energy",       price: 7800,  power_kw: 5,   type: "SOFC", weight_kg: 52,  efficiency: 65, tags: ["stationary","quiet"],      desc: "Solid oxide fuel cell for stationary power generation. Can run on H₂ or natural gas. Silent, no moving parts." },
  { id: "f3", category: "fuelcell",    name: "HorizonPack 1kW",       brand: "Horizon",            price: 2100,  power_kw: 1,   type: "PEM",  weight_kg: 9,   efficiency: 50, tags: ["portable","educational"],  desc: "Compact PEM fuel cell stack for prototyping, education, and small backup power. Air-cooled, self-humidifying." },
  { id: "se1", category: "sensor",     name: "H₂ Leak Detector Pro",  brand: "Honeywell",          price: 420,   type: "Electrochemical", range_ppm: 10000, response_s: 3,     tags: ["safety","ATEX"],           desc: "ATEX-certified electrochemical H₂ sensor. 0–100% LEL range, SIL2 rated, relay output." },
  { id: "se2", category: "sensor",     name: "FlowMaster Coriolis 2\"", brand: "Emerson",          price: 3100,  type: "Coriolis Flow",   accuracy_pct: 0.1, size_in: 2,        tags: ["flow","precision"],        desc: "High-accuracy Coriolis mass flowmeter for precise H₂ dispensing and production monitoring." },
  { id: "se3", category: "sensor",     name: "PressGuard 700bar",     brand: "Keller",             price: 280,   type: "Pressure",        range_bar: 700,    accuracy_pct: 0.1, tags: ["pressure","high-pressure"], desc: "Ceramic piezoresistive pressure transmitter. H₂-compatible wetted materials, 4–20mA output." },
  { id: "ct1", category: "controller", name: "H₂ SCADA Gateway",      brand: "Siemens",            price: 5400,  type: "SCADA PLC", io_channels: 64, connectivity: "Ethernet/Modbus/OPC-UA", tags: ["industrial","SCADA"], desc: "S7-1500 based PLC pre-configured for hydrogen plant control. Includes HMI panel and remote monitoring." },
  { id: "ct2", category: "controller", name: "EcoCtrl Nano",          brand: "HyControl",          price: 890,   type: "Embedded",  io_channels: 16, connectivity: "Wi-Fi/4G/Modbus",        tags: ["compact","IoT"],      desc: "Compact embedded controller for small electrolysis systems. Cloud dashboard, mobile app, OTA updates." },
];

// ── Compatibility checks ───────────────────────────────────────────────────────
function getCompatibilityWarnings(build) {
  const warnings = [];
  const { electrolyzer: elz, rectifier: rect, compressor: comp, storage: store, purifier: purif } = build;
  if (elz && rect) {
    if (rect.power_kw < elz.power_kw)
      warnings.push({ severity: "error", msg: `Rectifier (${rect.power_kw} kW) is underpowered for electrolyzer (${elz.power_kw} kW). Upgrade your PSU.` });
    else if (rect.power_kw > elz.power_kw * 1.5)
      warnings.push({ severity: "warn", msg: `Rectifier oversized (${rect.power_kw} kW vs ${elz.power_kw} kW needed). A smaller unit would save cost.` });
  }
  if (elz && comp && comp.input_bar < elz.pressure_bar - 5)
    warnings.push({ severity: "error", msg: `Compressor inlet (${comp.input_bar} bar) is below electrolyzer output (${elz.pressure_bar} bar). Pressure mismatch.` });
  if (comp && store && comp.output_bar < store.pressure_bar)
    warnings.push({ severity: "warn", msg: `Compressor max output (${comp.output_bar} bar) is below tank rated pressure (${store.pressure_bar} bar). Tank won't fill fully.` });
  if (elz && purif && elz.output_nm3h > purif.flow_nm3h)
    warnings.push({ severity: "warn", msg: `Purifier capacity (${purif.flow_nm3h} Nm³/h) is lower than electrolyzer output (${elz.output_nm3h} Nm³/h). Bottleneck risk.` });
  if (elz && elz.type === "SOEC" && !build.controller)
    warnings.push({ severity: "info", msg: "SOEC electrolyzers require precise temperature control — a system controller is strongly recommended." });
  return warnings;
}

// ── Spec pill ─────────────────────────────────────────────────────────────────
function Spec({ k, v }) {
  return (
    <div className="hb-spec">
      <span className="hb-spec-key">{k}</span>
      <span className="hb-spec-val">{v}</span>
    </div>
  );
}

// ── Part card ─────────────────────────────────────────────────────────────────
function PartCard({ part, onAdd, isSelected }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`hb-card${isSelected ? " selected" : ""}`} onClick={() => setExpanded(e => !e)}>
      {isSelected && <div className="hb-card-in-build">✓ IN BUILD</div>}
      <div className="hb-card-top">
        <div>
          <div className="hb-card-brand">{part.brand}</div>
          <div className="hb-card-name">{part.name}</div>
          <div className="hb-tags">
            {part.tags.map(t => <span key={t} className="hb-tag">{t}</span>)}
            {part.type && <span className="hb-tag type-tag">{part.type}</span>}
          </div>
        </div>
        <div className="hb-card-price">${part.price.toLocaleString()}</div>
      </div>
      <div className="hb-specs">
        {part.power_kw     && part.category !== "fuelcell" && <Spec k="Power"      v={`${part.power_kw} kW`} />}
        {part.power_kw     && part.category === "fuelcell" && <Spec k="Output"     v={`${part.power_kw} kW`} />}
        {part.output_nm3h  && <Spec k="Output"     v={`${part.output_nm3h} Nm³/h`} />}
        {part.pressure_bar && <Spec k="Pressure"   v={`${part.pressure_bar} bar`} />}
        {part.efficiency   && <Spec k="Efficiency" v={`${part.efficiency}%`} />}
        {part.capacity_nm3 && <Spec k="Capacity"   v={`${part.capacity_nm3} Nm³`} />}
        {part.input_bar    && <Spec k="Inlet"       v={`${part.input_bar} bar`} />}
        {part.output_bar   && <Spec k="Outlet"      v={`${part.output_bar} bar`} />}
        {part.purity_pct   && <Spec k="Purity"      v={`${part.purity_pct}%`} />}
      </div>
      {expanded && (
        <div className="hb-card-details">
          <p className="hb-card-desc">{part.desc}</p>
          <div className="hb-specs">
            {part.weight_kg    && <Spec k="Weight"       v={`${part.weight_kg} kg`} />}
            {part.material     && <Spec k="Material"     v={part.material} />}
            {part.connectivity && <Spec k="Connectivity" v={part.connectivity} />}
            {part.io_channels  && <Spec k="I/O channels" v={part.io_channels} />}
          </div>
        </div>
      )}
      <div className="hb-card-footer">
        <span className="hb-expand-hint">{expanded ? "▲ less" : "▼ details"}</span>
        <button
          className={`hb-add-btn ${isSelected ? "remove" : "add"}`}
          onClick={e => { e.stopPropagation(); onAdd(part); }}
        >
          {isSelected ? "REMOVE" : "ADD →"}
        </button>
      </div>
    </div>
  );
}

// ── Build row ─────────────────────────────────────────────────────────────────
function BuildRow({ category, part, onRemove }) {
  return (
    <div className="hb-build-row">
      <div className="hb-row-cat">
        {category.icon} {category.label}
        {category.required && <span className="hb-row-required">*</span>}
      </div>
      {part ? (
        <>
          <div>
            <div className="hb-row-name">{part.name}</div>
            <div className="hb-row-brand">{part.brand}</div>
          </div>
          <div className="hb-row-price">${part.price.toLocaleString()}</div>
          <button className="hb-remove-btn" onClick={onRemove}>✕</button>
        </>
      ) : (
        <>
          <div className="hb-row-empty">— not selected</div>
          <div className="hb-row-price empty">$0</div>
          <div />
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HydrogenBuilder() {
  const [build, setBuild]              = useState({});
  const [activeCategory, setActiveCat] = useState("electrolyzer");
  const [searchQuery, setSearch]       = useState("");
  const [sortBy, setSortBy]            = useState("price_asc");
  const [filterType, setFilterType]    = useState("all");

  const filteredParts = useMemo(() => {
    let parts = PARTS.filter(p => p.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      parts = parts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q)) ||
        (p.type && p.type.toLowerCase().includes(q))
      );
    }
    if (filterType !== "all")
      parts = parts.filter(p => p.tags.includes(filterType) || p.type === filterType);
    return parts.sort((a, b) => {
      if (sortBy === "price_asc")  return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  }, [activeCategory, searchQuery, sortBy, filterType]);

  const total           = useMemo(() => Object.values(build).reduce((s, p) => s + (p?.price || 0), 0), [build]);
  const warnings        = useMemo(() => getCompatibilityWarnings(build), [build]);
  const requiredMissing = CATEGORIES.filter(c => c.required && !build[c.id]);
  const hasErrors       = warnings.some(w => w.severity === "error");

  const allFilters = useMemo(() => {
    const tags = new Set();
    PARTS.filter(p => p.category === activeCategory).forEach(p => {
      p.tags.forEach(t => tags.add(t));
      if (p.type) tags.add(p.type);
    });
    return ["all", ...Array.from(tags)];
  }, [activeCategory]);

  function handleAdd(part) {
    setBuild(b => {
      const next = { ...b };
      if (next[part.category]?.id === part.id) delete next[part.category];
      else next[part.category] = part;
      return next;
    });
  }

  const saveBtnDisabled = requiredMissing.length > 0 || hasErrors;
  const saveBtnLabel = requiredMissing.length > 0
    ? `SELECT ${requiredMissing.length} MORE REQUIRED PART${requiredMissing.length > 1 ? "S" : ""}`
    : hasErrors ? "FIX COMPATIBILITY ERRORS" : "SAVE BUILD →";

  return (
    <div className="hb-root">
      <header className="hb-header">
        <span className="hb-logo">Project Evergreen — System Builder</span>
        <div className="hb-header-right">
          {warnings.filter(w => w.severity === "error").length > 0 && (
            <span className="hb-error-badge">
              ⚠ {warnings.filter(w => w.severity === "error").length} error{warnings.filter(w => w.severity === "error").length > 1 ? "s" : ""}
            </span>
          )}
          <span className="hb-total-chip">Total: ${total.toLocaleString()}</span>
        </div>
      </header>

      <div className="hb-layout">
        <nav className="hb-sidebar">
          <div className="hb-sidebar-label">Components</div>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`hb-cat-btn${activeCategory === cat.id ? " active" : ""}`}
              onClick={() => { setActiveCat(cat.id); setSearch(""); setFilterType("all"); }}
            >
              <span className="hb-cat-btn-icon">{cat.icon}</span>
              <span className="hb-cat-btn-label">{cat.label}</span>
              {build[cat.id]
                ? <span className="hb-cat-check">✓</span>
                : cat.required && <span className="hb-cat-required-dot">*</span>}
            </button>
          ))}
          <hr className="hb-sidebar-divider" />
          <div className="hb-sidebar-label">Progress</div>
          {CATEGORIES.map(cat => (
            <div key={cat.id} className="hb-progress-row">
              <div className={`hb-progress-dot ${build[cat.id] ? "done" : cat.required ? "req" : "opt"}`} />
              <span className={`hb-progress-text${build[cat.id] ? " done" : ""}`}>{cat.label}</span>
            </div>
          ))}
        </nav>

        <main className="hb-catalog">
          <div className="hb-section-title">
            <span>{CATEGORIES.find(c => c.id === activeCategory)?.icon}</span>
            <span>{CATEGORIES.find(c => c.id === activeCategory)?.label}</span>
            <span className="hb-section-count">— {filteredParts.length} parts</span>
          </div>
          <div className="hb-filter-bar">
            <input
              className="hb-search"
              placeholder="Search parts…"
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="hb-sort" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="hb-filter-chips">
            {allFilters.map(f => (
              <button key={f} className={`hb-chip${filterType === f ? " active" : ""}`} onClick={() => setFilterType(f)}>{f}</button>
            ))}
          </div>
          <div className="hb-parts-list">
            {filteredParts.length === 0
              ? <div className="hb-empty">No parts match your filters.</div>
              : filteredParts.map(part => (
                <PartCard
                  key={part.id}
                  part={part}
                  onAdd={handleAdd}
                  isSelected={build[part.category]?.id === part.id}
                />
              ))
            }
          </div>
        </main>

        <aside className="hb-panel">
          <div className="hb-panel-header">Your Build</div>
          {CATEGORIES.map(cat => (
            <BuildRow
              key={cat.id}
              category={cat}
              part={build[cat.id]}
              onRemove={() => setBuild(b => { const n = { ...b }; delete n[cat.id]; return n; })}
            />
          ))}
          {warnings.length > 0 && (
            <div className="hb-warnings">
              <div className="hb-warnings-title">⚠ Compatibility</div>
              {warnings.map((w, i) => (
                <div key={i} className={`hb-warning-box ${w.severity}`}>{w.msg}</div>
              ))}
            </div>
          )}
          {requiredMissing.length > 0 && (
            <div className="hb-missing">
              <div className="hb-missing-title">Required missing</div>
              {requiredMissing.map(c => (
                <div key={c.id} className="hb-missing-item">✕ {c.label}</div>
              ))}
            </div>
          )}
          <div className="hb-totals">
            <div className="hb-total-row">
              <span className="hb-total-label">Estimated Total</span>
              <span className="hb-total-amount">${total.toLocaleString()}</span>
            </div>
            <div className="hb-total-meta">
              {Object.keys(build).length} of {CATEGORIES.length} components selected · Prices are indicative
            </div>
            <button className={`hb-save-btn ${saveBtnDisabled ? "disabled" : "ready"}`} disabled={saveBtnDisabled}>
              {saveBtnLabel}
            </button>
            {Object.keys(build).length > 0 && (
              <button className="hb-clear-btn" onClick={() => setBuild({})}>CLEAR BUILD</button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}