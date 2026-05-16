import { useState, useMemo } from "react";

// ── Data ──────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "electrolyzer",  label: "Electrolyzer",         required: true  },
  { id: "rectifier",     label: "Rectifier / PSU",      required: true  },
  { id: "storage",       label: "H₂ Storage Tank",      required: true  },
  { id: "compressor",    label: "Compressor",           required: true  },
  { id: "purifier",      label: "Purifier / Dryer",     required: false },
  { id: "fuelcell",      label: "Fuel Cell",            required: false },
  { id: "sensor",        label: "Safety Sensors",       required: false },
  { id: "controller",    label: "System Controller",    required: false },
];

const PARTS = [
  // Electrolyzers
  { id: "e1", category: "electrolyzer", name: "ProtonEx PEM-5", brand: "Proton Energy", price: 4800, power_kw: 5, output_nm3h: 1.0, type: "PEM", pressure_bar: 35, weight_kg: 48, efficiency: 78, tags: ["residential","compact"], desc: "Compact PEM unit ideal for residential or lab use. Low maintenance, fast startup, produces 99.999% pure H₂." },
  { id: "e2", category: "electrolyzer", name: "AlkaFlex 30", brand: "HydraTech", price: 12500, power_kw: 30, output_nm3h: 6.0, type: "Alkaline", pressure_bar: 30, weight_kg: 210, efficiency: 72, tags: ["industrial","high-output"], desc: "Industrial alkaline electrolyzer with proven 20-year lifespan. Lower capex per kW, best for constant-load operations." },
  { id: "e3", category: "electrolyzer", name: "SolidOx SOEC-20", brand: "Elcogen", price: 28000, power_kw: 20, output_nm3h: 5.2, type: "SOEC", pressure_bar: 15, weight_kg: 95, efficiency: 89, tags: ["high-efficiency","industrial"], desc: "Solid oxide electrolyzer operating at 800°C. Highest electrical efficiency available; ideal for waste-heat pairing." },
  { id: "e4", category: "electrolyzer", name: "NanoMem PEM-1", brand: "ITM Power", price: 1900, power_kw: 1, output_nm3h: 0.2, type: "PEM", pressure_bar: 30, weight_kg: 14, efficiency: 76, tags: ["residential","entry-level"], desc: "Entry-level PEM electrolyzer for hobbyists, researchers, and small-scale pilots. Plug-and-play design." },

  // Rectifiers
  { id: "r1", category: "rectifier", name: "RectPro 10kW", brand: "AEG Power", price: 1100, power_kw: 10, input_voltage: "3-phase 400V", ripple_pct: 2, efficiency: 95, weight_kg: 22, tags: ["universal"], desc: "High-efficiency switch-mode rectifier. Wide input range, soft-start protection, IGBT technology." },
  { id: "r2", category: "rectifier", name: "SolarDC 5kW", brand: "SMA", price: 780, power_kw: 5, input_voltage: "PV 200-900V DC", ripple_pct: 1.5, efficiency: 97, weight_kg: 12, tags: ["solar","residential"], desc: "DC-DC converter optimized for direct PV-to-electrolyzer coupling. MPPT tracking built in." },
  { id: "r3", category: "rectifier", name: "InduRect 35kW", brand: "Schneider Electric", price: 3400, power_kw: 35, input_voltage: "3-phase 690V", ripple_pct: 1, efficiency: 96, weight_kg: 68, tags: ["industrial"], desc: "Heavy-duty industrial rectifier for alkaline and large PEM stacks. Includes thyristor bridge and active filtering." },

  // Storage
  { id: "s1", category: "storage", name: "CompTank 200L / 350bar", brand: "Luxfer", price: 3200, capacity_nm3: 70, pressure_bar: 350, material: "Carbon Fibre (Type IV)", weight_kg: 38, tags: ["high-pressure","mobile"], desc: "Lightweight Type IV carbon fibre cylinder. Ideal for on-site buffer storage or vehicle fueling." },
  { id: "s2", category: "storage", name: "SteelVault 1000L / 200bar", brand: "Worthington", price: 5900, capacity_nm3: 200, pressure_bar: 200, material: "Steel (Type I)", weight_kg: 420, tags: ["stationary","industrial"], desc: "Robust steel pressure vessel for stationary industrial installations. Long service life, lower unit cost." },
  { id: "s3", category: "storage", name: "MH Alloy Canister 5kg", brand: "McPhy", price: 8400, capacity_nm3: 55, pressure_bar: 30, material: "Metal Hydride", weight_kg: 95, tags: ["low-pressure","safe"], desc: "Metal hydride storage at near-ambient pressure. Safest storage option; releases H₂ on gentle heating." },

  // Compressors
  { id: "c1", category: "compressor", name: "DiaphComp 35-350", brand: "PDC Machines", price: 6200, input_bar: 35, output_bar: 350, flow_nm3h: 2, power_kw: 3.5, weight_kg: 180, tags: ["oil-free","high-pressure"], desc: "Diaphragm compressor, oil-free, zero contamination. Standard for fueling station cascade charging." },
  { id: "c2", category: "compressor", name: "IonicLiquid 30-200", brand: "Linde", price: 9800, input_bar: 30, output_bar: 200, flow_nm3h: 6, power_kw: 5.2, weight_kg: 240, tags: ["oil-free","low-noise"], desc: "Ionic liquid piston compressor. Near-isothermal compression, extremely low noise, zero oil carryover." },
  { id: "c3", category: "compressor", name: "RecipComp 10-30", brand: "Bauer", price: 2100, input_bar: 10, output_bar: 30, flow_nm3h: 5, power_kw: 2.2, weight_kg: 85, tags: ["low-pressure","budget"], desc: "Reciprocating single-stage compressor for low-pressure buffering. Cost-effective for alkaline system integration." },

  // Purifiers
  { id: "p1", category: "purifier", name: "PdMembrane H₂-Pure 5", brand: "Air Products", price: 2200, purity_pct: 99.9999, flow_nm3h: 5, pressure_bar: 20, weight_kg: 18, tags: ["ultra-pure","fuel-cell-grade"], desc: "Palladium membrane purifier achieving 6N purity. Required for fuel cell and semiconductor applications." },
  { id: "p2", category: "purifier", name: "PSA Dryer 10Nm³/h", brand: "Generon", price: 1400, purity_pct: 99.999, flow_nm3h: 10, pressure_bar: 8, weight_kg: 42, tags: ["drying","general"], desc: "Pressure swing adsorption dryer removes moisture and trace impurities. Suitable for most industrial applications." },

  // Fuel Cells
  { id: "f1", category: "fuelcell", name: "PowerCell S3", brand: "PowerCell Sweden", price: 14500, power_kw: 125, type: "PEM", weight_kg: 145, efficiency: 60, tags: ["transport","high-power"], desc: "Heavy-duty PEM fuel cell module for truck, bus, or marine propulsion. Proven 10,000+ hour lifetime." },
  { id: "f2", category: "fuelcell", name: "BluGen 5kW", brand: "Bloom Energy", price: 7800, power_kw: 5, type: "SOFC", weight_kg: 52, efficiency: 65, tags: ["stationary","quiet"], desc: "Solid oxide fuel cell for stationary power generation. Can run on H₂ or natural gas. Silent, no moving parts." },
  { id: "f3", category: "fuelcell", name: "HorizonPack 1kW", brand: "Horizon", price: 2100, power_kw: 1, type: "PEM", weight_kg: 9, efficiency: 50, tags: ["portable","educational"], desc: "Compact PEM fuel cell stack for prototyping, education, and small backup power. Air-cooled, self-humidifying." },

  // Sensors
  { id: "se1", category: "sensor", name: "H₂ Leak Detector Pro", brand: "Honeywell", price: 420, type: "Electrochemical", range_ppm: 10000, response_s: 3, tags: ["safety","ATEX"], desc: "ATEX-certified electrochemical H₂ sensor. 0–100% LEL range, SIL2 rated, relay output." },
  { id: "se2", category: "sensor", name: "FlowMaster Coriolis 2\"", brand: "Emerson", price: 3100, type: "Coriolis Flow", accuracy_pct: 0.1, size_in: 2, tags: ["flow","precision"], desc: "High-accuracy Coriolis mass flowmeter for precise H₂ dispensing and production monitoring." },
  { id: "se3", category: "sensor", name: "PressGuard 700bar", brand: "Keller", price: 280, type: "Pressure", range_bar: 700, accuracy_pct: 0.1, tags: ["pressure","high-pressure"], desc: "Ceramic piezoresistive pressure transmitter. H₂-compatible wetted materials, 4–20mA output." },

  // Controllers
  { id: "ct1", category: "controller", name: "H₂ SCADA Gateway", brand: "Siemens", price: 5400, type: "SCADA PLC", io_channels: 64, connectivity: "Ethernet/Modbus/OPC-UA", tags: ["industrial","SCADA"], desc: "S7-1500 based PLC pre-configured for hydrogen plant control. Includes HMI panel and remote monitoring." },
  { id: "ct2", category: "controller", name: "EcoCtrl Nano", brand: "HyControl", price: 890, type: "Embedded", io_channels: 16, connectivity: "Wi-Fi/4G/Modbus", tags: ["compact","IoT"], desc: "Compact embedded controller for small electrolysis systems. Cloud dashboard, mobile app, OTA updates." },
];

// ── Compatibility checks ───────────────────────────────────────────────────────
function getCompatibilityWarnings(build) {
  const warnings = [];
  const elz = build.electrolyzer;
  const rect = build.rectifier;
  const comp = build.compressor;
  const store = build.storage;
  const purif = build.purifier;

  if (elz && rect) {
    if (rect.power_kw < elz.power_kw) {
      warnings.push({ severity: "error", msg: `Rectifier (${rect.power_kw} kW) is underpowered for electrolyzer (${elz.power_kw} kW). Upgrade your PSU.` });
    } else if (rect.power_kw > elz.power_kw * 1.5) {
      warnings.push({ severity: "warn", msg: `Rectifier is significantly oversized (${rect.power_kw} kW vs ${elz.power_kw} kW needed). Consider a smaller unit to save cost.` });
    }
  }

  if (elz && comp) {
    if (comp.input_bar < elz.pressure_bar - 5) {
      warnings.push({ severity: "error", msg: `Compressor inlet (${comp.input_bar} bar) is below electrolyzer output pressure (${elz.pressure_bar} bar). Pressure mismatch.` });
    }
  }

  if (comp && store) {
    if (comp.output_bar < store.pressure_bar) {
      warnings.push({ severity: "warn", msg: `Compressor max output (${comp.output_bar} bar) is below tank rated pressure (${store.pressure_bar} bar). Tank won't fill fully.` });
    }
  }

  if (elz && purif) {
    if (elz.output_nm3h > purif.flow_nm3h) {
      warnings.push({ severity: "warn", msg: `Purifier capacity (${purif.flow_nm3h} Nm³/h) is lower than electrolyzer output (${elz.output_nm3h} Nm³/h). Bottleneck risk.` });
    }
  }

  if (elz && elz.type === "SOEC" && !build.controller) {
    warnings.push({ severity: "info", msg: "SOEC electrolyzers require precise temperature control — a system controller is strongly recommended." });
  }

  return warnings;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PartCard({ part, onAdd, isSelected, isInBuild }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: isSelected ? "rgba(74,222,128,0.07)" : "#0d1a10",
      border: `1px solid ${isSelected ? "#4ade80" : "#1a3a2a"}`,
      borderRadius: 8,
      padding: "16px 18px",
      transition: "border-color 0.2s, background 0.2s",
      cursor: "pointer",
      position: "relative",
    }}
      onClick={() => setExpanded(e => !e)}
    >
      {isSelected && (
        <div style={{ position: "absolute", top: 10, right: 12, fontSize: 11, color: "#4ade80", fontFamily: "monospace", letterSpacing: "0.1em" }}>
          ✓ IN BUILD
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#4a6a52", fontFamily: "monospace", letterSpacing: "0.1em", marginBottom: 4 }}>{part.brand}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#c8e8d0", marginBottom: 6 }}>{part.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {part.tags.map(t => (
              <span key={t} style={{ background: "#0a1f12", border: "1px solid #1a3a2a", borderRadius: 3, fontSize: 10, color: "#5a9a6a", padding: "2px 7px", fontFamily: "monospace" }}>{t}</span>
            ))}
            {part.type && <span style={{ background: "#0a1f12", border: "1px solid #2a4a32", borderRadius: 3, fontSize: 10, color: "#7abf8a", padding: "2px 7px", fontFamily: "monospace" }}>{part.type}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "monospace", fontSize: 18, color: "#4ade80", fontWeight: 700 }}>${part.price.toLocaleString()}</div>
        </div>
      </div>

      {/* Key specs row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        {part.power_kw     && <Spec k="Power"      v={`${part.power_kw} kW`} />}
        {part.output_nm3h  && <Spec k="Output"     v={`${part.output_nm3h} Nm³/h`} />}
        {part.pressure_bar && <Spec k="Pressure"   v={`${part.pressure_bar} bar`} />}
        {part.efficiency   && <Spec k="Efficiency" v={`${part.efficiency}%`} />}
        {part.capacity_nm3 && <Spec k="Capacity"   v={`${part.capacity_nm3} Nm³`} />}
        {part.input_bar    && <Spec k="Inlet"      v={`${part.input_bar} bar`} />}
        {part.output_bar   && <Spec k="Outlet"     v={`${part.output_bar} bar`} />}
        {part.purity_pct   && <Spec k="Purity"     v={`${part.purity_pct}%`} />}
        {part.power_kw && part.category === "fuelcell" && <Spec k="Output" v={`${part.power_kw} kW`} />}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1a3a2a" }}>
          <p style={{ fontSize: 13, color: "#6a9a7a", lineHeight: 1.65, marginBottom: 12 }}>{part.desc}</p>
          {part.weight_kg && <Spec k="Weight" v={`${part.weight_kg} kg`} />}
          {part.material  && <Spec k="Material" v={part.material} />}
          {part.connectivity && <Spec k="Connectivity" v={part.connectivity} />}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <span style={{ fontSize: 11, color: "#3a5a42", fontFamily: "monospace" }}>{expanded ? "▲ less" : "▼ details"}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(part); }}
          style={{
            background: isSelected ? "transparent" : "#4ade80",
            color: isSelected ? "#4ade80" : "#050f0a",
            border: isSelected ? "1px solid #4ade80" : "none",
            borderRadius: 5,
            padding: "7px 16px",
            fontFamily: "monospace",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.06em",
            transition: "all 0.15s",
          }}
        >
          {isSelected ? "REMOVE" : "ADD →"}
        </button>
      </div>
    </div>
  );
}

function Spec({ k, v }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 10, color: "#3a5a42", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{k}</span>
      <span style={{ fontSize: 13, color: "#8abf9a", fontFamily: "monospace" }}>{v}</span>
    </div>
  );
}

function BuildRow({ category, part, onRemove }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr auto auto",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      borderBottom: "1px solid #0d2016",
      fontSize: 13,
    }}>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#4a6a52", letterSpacing: "0.08em" }}>
        {category.label}
        {category.required && <span style={{ color: "#e74c3c", marginLeft: 4 }}>*</span>}
      </div>
      {part ? (
        <>
          <div>
            <div style={{ color: "#c8e8d0", fontWeight: 500 }}>{part.name}</div>
            <div style={{ fontSize: 11, color: "#4a6a52" }}>{part.brand}</div>
          </div>
          <div style={{ fontFamily: "monospace", color: "#4ade80", fontWeight: 700, whiteSpace: "nowrap" }}>
            ${part.price.toLocaleString()}
          </div>
          <button onClick={onRemove} style={{ background: "transparent", border: "1px solid #2a3a2a", color: "#5a7a5a", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", fontSize: 11, transition: "all 0.15s" }}
            onMouseEnter={e => { e.target.style.borderColor = "#e74c3c"; e.target.style.color = "#e74c3c"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#2a3a2a"; e.target.style.color = "#5a7a5a"; }}
          >✕</button>
        </>
      ) : (
        <>
          <div style={{ color: "#2a4a2a", fontStyle: "italic", fontSize: 12 }}>— not selected</div>
          <div style={{ color: "#2a4a2a", fontFamily: "monospace" }}>$0</div>
          <div />
        </>
      )}
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function HydrogenBuilder() {
  const [build, setBuild] = useState({});
  const [activeCategory, setActiveCategory] = useState("electrolyzer");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("price_asc");
  const [filterType, setFilterType] = useState("all");

  const activePart = build[activeCategory];

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
    if (filterType !== "all") {
      parts = parts.filter(p => p.tags.includes(filterType) || p.type === filterType);
    }
    return parts.sort((a, b) => {
      if (sortBy === "price_asc")  return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      if (sortBy === "name")       return a.name.localeCompare(b.name);
      return 0;
    });
  }, [activeCategory, searchQuery, sortBy, filterType]);

  const total = useMemo(() => Object.values(build).reduce((s, p) => s + (p?.price || 0), 0), [build]);

  const warnings = useMemo(() => getCompatibilityWarnings(build), [build]);

  const requiredMissing = CATEGORIES.filter(c => c.required && !build[c.id]);

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
      if (next[part.category]?.id === part.id) {
        delete next[part.category];
      } else {
        next[part.category] = part;
      }
      return next;
    });
  }

  const styles = {
    root: { minHeight: "100vh", background: "#050f0a", color: "#c8e8d0", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" },
    header: { background: "#030a05", borderBottom: "1px solid #0d2016", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, position: "sticky", top: 0, zIndex: 50 },
    logo: { fontFamily: "monospace", fontSize: 14, color: "#4ade80", letterSpacing: "0.1em", fontWeight: 700 },
    totalChip: { fontFamily: "monospace", fontSize: 13, background: "#0d2016", border: "1px solid #1a3a2a", borderRadius: 6, padding: "6px 14px", color: "#4ade80" },
    layout: { display: "grid", gridTemplateColumns: "220px 1fr 380px", minHeight: "calc(100vh - 52px)" },
    sidebar: { borderRight: "1px solid #0d2016", background: "#030a05", padding: "16px 0" },
    catBtn: (active) => ({
      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px",
      background: active ? "#0d2016" : "transparent",
      borderLeft: active ? "2px solid #4ade80" : "2px solid transparent",
      color: active ? "#4ade80" : "#4a6a52",
      fontSize: 13, fontFamily: "monospace", cursor: "pointer", border: "none",
      textAlign: "left", letterSpacing: "0.03em", transition: "all 0.15s",
    }),
    catalog: { padding: "20px 24px", overflowY: "auto", maxHeight: "calc(100vh - 52px)" },
    buildPanel: { borderLeft: "1px solid #0d2016", background: "#030a05", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 52px)", overflowY: "auto" },
    buildHeader: { padding: "16px 20px", borderBottom: "1px solid #0d2016", fontFamily: "monospace", fontSize: 12, color: "#4a6a52", letterSpacing: "0.1em" },
    filterBar: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
    input: { background: "#0a1f12", border: "1px solid #1a3a2a", borderRadius: 6, padding: "8px 12px", color: "#c8e8d0", fontSize: 13, fontFamily: "monospace", outline: "none", flex: 1, minWidth: 160 },
    select: { background: "#0a1f12", border: "1px solid #1a3a2a", borderRadius: 6, padding: "8px 10px", color: "#8abf9a", fontSize: 12, fontFamily: "monospace", cursor: "pointer", outline: "none" },
    filterChip: (active) => ({
      background: active ? "#4ade80" : "#0a1f12",
      color: active ? "#050f0a" : "#5a9a6a",
      border: "1px solid #1a3a2a",
      borderRadius: 4, padding: "4px 10px", fontSize: 11, fontFamily: "monospace",
      cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.06em",
    }),
    sectionTitle: { fontFamily: "monospace", fontSize: 11, color: "#4a6a52", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 },
    warningBox: (sev) => ({
      background: sev === "error" ? "rgba(231,76,60,0.08)" : sev === "warn" ? "rgba(243,156,18,0.08)" : "rgba(74,222,128,0.05)",
      border: `1px solid ${sev === "error" ? "rgba(231,76,60,0.4)" : sev === "warn" ? "rgba(243,156,18,0.3)" : "#1a3a2a"}`,
      borderRadius: 6, padding: "10px 14px", fontSize: 12,
      color: sev === "error" ? "#e74c3c" : sev === "warn" ? "#f39c12" : "#4a8a5a",
      lineHeight: 1.5, marginBottom: 6,
    }),
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={styles.logo}>H₂ BUILDER</span>
          <span style={{ fontSize: 12, color: "#2d5a3a", fontFamily: "monospace" }}>// assemble your hydrogen system</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {warnings.filter(w => w.severity === "error").length > 0 && (
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#e74c3c", background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)", borderRadius: 4, padding: "4px 10px" }}>
              ⚠ {warnings.filter(w => w.severity === "error").length} error{warnings.filter(w => w.severity === "error").length > 1 ? "s" : ""}
            </span>
          )}
          <div style={styles.totalChip}>TOTAL: ${total.toLocaleString()}</div>
        </div>
      </div>

      {/* 3-col layout */}
      <div style={styles.layout}>

        {/* Category sidebar */}
        <div style={styles.sidebar}>
          <div style={{ padding: "8px 20px 12px", fontSize: 10, color: "#2d4a32", fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase" }}>Components</div>
          {CATEGORIES.map(cat => (
            <button key={cat.id} style={styles.catBtn(activeCategory === cat.id)} onClick={() => { setActiveCategory(cat.id); setSearchQuery(""); setFilterType("all"); }}>
              <span style={{ flex: 1 }}>{cat.label}</span>
              {build[cat.id] ? (
                <span style={{ fontSize: 9, color: "#4ade80", background: "#0d2016", borderRadius: 3, padding: "2px 5px" }}>✓</span>
              ) : cat.required ? (
                <span style={{ fontSize: 9, color: "#e74c3c" }}>*</span>
              ) : null}
            </button>
          ))}

          <div style={{ margin: "16px 0", borderTop: "1px solid #0d2016" }} />
          <div style={{ padding: "8px 20px 12px", fontSize: 10, color: "#2d4a32", fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase" }}>Progress</div>
          {CATEGORIES.map(cat => (
            <div key={cat.id} style={{ padding: "4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: build[cat.id] ? "#4ade80" : cat.required ? "#2a1a1a" : "#0d2016", border: build[cat.id] ? "none" : `1px solid ${cat.required ? "#3a1a1a" : "#1a3a2a"}` }} />
              <span style={{ fontSize: 11, color: build[cat.id] ? "#4ade80" : "#2d4a32", fontFamily: "monospace" }}>{cat.label}</span>
            </div>
          ))}
        </div>

        {/* Parts catalog */}
        <div style={styles.catalog}>
          <div style={styles.sectionTitle}>
            <span>{CATEGORIES.find(c => c.id === activeCategory)?.label}</span>
            <span style={{ color: "#2d4a32" }}>— {filteredParts.length} parts</span>
          </div>

          {/* Filter bar */}
          <div style={styles.filterBar}>
            <input
              style={styles.input}
              placeholder="Search parts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select style={styles.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {allFilters.map(f => (
              <button key={f} style={styles.filterChip(filterType === f)} onClick={() => setFilterType(f)}>{f}</button>
            ))}
          </div>

          {/* Part cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredParts.length === 0 ? (
              <div style={{ color: "#2d4a32", fontFamily: "monospace", fontSize: 13, padding: "40px 0", textAlign: "center" }}>No parts match your filters.</div>
            ) : filteredParts.map(part => (
              <PartCard
                key={part.id}
                part={part}
                onAdd={handleAdd}
                isSelected={build[part.category]?.id === part.id}
                isInBuild={!!build[part.category]}
              />
            ))}
          </div>
        </div>

        {/* Build panel */}
        <div style={styles.buildPanel}>
          <div style={styles.buildHeader}>// YOUR BUILD</div>

          {/* Build list */}
          <div style={{ flex: 1 }}>
            {CATEGORIES.map(cat => (
              <BuildRow key={cat.id} category={cat} part={build[cat.id]} onRemove={() => setBuild(b => { const n = { ...b }; delete n[cat.id]; return n; })} />
            ))}
          </div>

          {/* Compatibility warnings */}
          {warnings.length > 0 && (
            <div style={{ padding: "16px 16px 8px" }}>
              <div style={{ ...styles.sectionTitle, marginBottom: 10 }}>⚠ Compatibility</div>
              {warnings.map((w, i) => (
                <div key={i} style={styles.warningBox(w.severity)}>{w.msg}</div>
              ))}
            </div>
          )}

          {/* Missing required */}
          {requiredMissing.length > 0 && (
            <div style={{ padding: "8px 16px" }}>
              <div style={{ fontSize: 11, color: "#3a4a3a", fontFamily: "monospace", letterSpacing: "0.1em", marginBottom: 6 }}>REQUIRED MISSING</div>
              {requiredMissing.map(c => (
                <div key={c.id} style={{ fontSize: 12, color: "#5a3a3a", fontFamily: "monospace", padding: "3px 0" }}>✕ {c.label}</div>
              ))}
            </div>
          )}

          {/* Total */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid #0d2016", background: "#030a05" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#4a6a52", letterSpacing: "0.1em" }}>ESTIMATED TOTAL</span>
              <span style={{ fontFamily: "monospace", fontSize: 22, color: "#4ade80", fontWeight: 700 }}>${total.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, color: "#2d4a32", marginBottom: 14 }}>
              {Object.keys(build).length} of {CATEGORIES.length} component{CATEGORIES.length > 1 ? "s" : ""} selected · Prices are indicative
            </div>
            <button
              disabled={requiredMissing.length > 0 || warnings.some(w => w.severity === "error")}
              style={{
                width: "100%",
                padding: "12px",
                background: requiredMissing.length > 0 || warnings.some(w => w.severity === "error") ? "#0d2016" : "#4ade80",
                color: requiredMissing.length > 0 || warnings.some(w => w.severity === "error") ? "#2d4a32" : "#050f0a",
                border: "none",
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: 13,
                fontWeight: 700,
                cursor: requiredMissing.length > 0 || warnings.some(w => w.severity === "error") ? "not-allowed" : "pointer",
                letterSpacing: "0.08em",
                transition: "all 0.15s",
              }}
            >
              {requiredMissing.length > 0 ? `SELECT ${requiredMissing.length} MORE REQUIRED PART${requiredMissing.length > 1 ? "S" : ""}` :
               warnings.some(w => w.severity === "error") ? "FIX COMPATIBILITY ERRORS" :
               "SAVE BUILD →"}
            </button>
            {Object.keys(build).length > 0 && (
              <button
                onClick={() => setBuild({})}
                style={{ width: "100%", marginTop: 8, padding: "8px", background: "transparent", color: "#3a5a3a", border: "1px solid #1a3a2a", borderRadius: 6, fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}
              >
                CLEAR BUILD
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
