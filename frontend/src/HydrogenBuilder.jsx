import { useState, useMemo } from "react";
import "./builder.css";
import { PARTS, CATEGORIES } from "./data";

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
        <span className="hb-expand-hint">{expanded ? "▲ Less" : "▼ Details"}</span>
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
        {category.label}
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