// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  query:    "",
  category: "all",
  type:     "all",
  sort:     "output_desc",
  modular:  false,
  compressor: false,
  minOutput: "",
  maxOutput: "",
};
let chatHistory = [];
let searchTimer = null;
let expandedCards = new Set();
 
// ── Fetch & render components ─────────────────────────────────────────────────
async function fetchComponents() {
  state.sort  = document.getElementById("sort-select").value;
  state.query = document.getElementById("search-input").value.trim();
 
  const params = new URLSearchParams({
    q:        state.query,
    category: state.category,
    sort:     state.sort,
  });
  if (state.type !== "all")    params.set("type", state.type);
  if (state.modular)           params.set("modular", "true");
  if (state.compressor)        params.set("compressor_included", "true");
  if (state.minOutput)         params.set("min_output", state.minOutput);
  if (state.maxOutput)         params.set("max_output", state.maxOutput);
 
  const res  = await fetch(`/api/components?${params}`);
  const data = await res.json();
 
  renderResults(data.results);
  document.getElementById("results-meta").innerHTML =
    `<span>${data.total}</span> component${data.total !== 1 ? "s" : ""} found` +
    (state.query ? ` for "<strong>${escHtml(state.query)}</strong>"` : "");
}
 
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchComponents, 280);
}
 
// ── Render ────────────────────────────────────────────────────────────────────
function renderResults(items) {
  const grid = document.getElementById("results-grid");
  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No components found</h3>
        <p>Try adjusting your search or clearing the filters.</p>
      </div>`;
    return;
  }
  grid.innerHTML = items.map(c => renderCard(c)).join("");
}
 
function renderCard(c) {
  const isExpanded = expandedCards.has(c.id);
  const price = c.price != null
    ? `<div class="card-price">$${Number(c.price).toLocaleString()}</div>`
    : `<div class="card-price rfq">Contact for price</div>`;
 
  const tags = (c.tags || []).map(t =>
    `<span class="tag">${escHtml(t)}</span>`
  ).join("") + (c.type ? `<span class="tag type-tag">${escHtml(c.type)}</span>` : "");
 
  // Primary specs (always visible)
  const primarySpecs = [
    c.production_rate_raw && spec("H₂ output", c.production_rate_raw, true),
    c.power_raw           && spec("Energy use", c.power_raw),
    c.pressure_raw        && spec("Output pressure", c.pressure_raw),
    c.purity_pct          && spec("Purity", `${c.purity_pct}%`),
    c.efficiency          && spec("Efficiency", `${c.efficiency}%`),
    c.turndown_range      && spec("Turndown", `${c.turndown_range}%`),
    // generic specs for non-electrolyzers
    c.power_kw && !c.production_rate_raw && spec("Power", `${c.power_kw} kW`, true),
    c.capacity_nm3        && spec("Capacity", `${c.capacity_nm3} Nm³`, true),
    c.flow_nm3h           && spec("Flow", `${c.flow_nm3h} Nm³/h`),
  ].filter(Boolean).join("");
 
  const badges = [
    c.modular            && `<span class="badge">Modular</span>`,
    c.compressor_included && `<span class="badge">Compressor included</span>`,
    c.input_power_type === "AC" && `<span class="badge">AC-ready</span>`,
  ].filter(Boolean).join("");
 
  // Expanded detail
  const detail = isExpanded ? `
    <div class="card-detail">
      <div class="card-detail-specs">
        ${c.footprint       ? spec("Footprint",    c.footprint) : ""}
        ${c.weight          ? spec("Weight",       c.weight) : ""}
        ${c.system_lifetime ? spec("Lifetime",     c.system_lifetime) : ""}
        ${c.water_consumption_l_nm3 != null ? spec("Water use", `${c.water_consumption_l_nm3} L/Nm³`) : ""}
        ${c.temp_min_c != null && c.temp_max_c != null
            ? spec("Temp range", `${c.temp_min_c}°C to ${c.temp_max_c}°C`) : ""}
        ${c.country ? spec("Country", c.country) : ""}
        ${c.year    ? spec("Year",    c.year)    : ""}
      </div>
      ${c.notes ? `<p class="card-notes">${escHtml(c.notes)}</p>` : ""}
    </div>` : "";
 
  return `
  <div class="comp-card${isExpanded ? " expanded" : ""}" id="card-${c.id}" onclick="toggleCard('${c.id}')">
    <div class="card-top">
      <div>
        <div class="card-brand">${escHtml(c.brand)}${c.country ? ` · ${escHtml(c.country)}` : ""}</div>
        <div class="card-name">${escHtml(c.name)}</div>
      </div>
      ${price}
    </div>
    <div class="card-tags">${tags}</div>
    <div class="card-specs">${primarySpecs}</div>
    ${badges ? `<div class="card-badges">${badges}</div>` : ""}
    ${detail}
    <div class="card-footer">
      <span class="expand-hint">${isExpanded ? "▲ Less" : "▼ Details"}</span>
      <button class="ask-btn" onclick="askAbout(event, '${c.id}', '${escAttr(c.name)}')">
        Ask AI about this →
      </button>
    </div>
  </div>`;
}
 
function spec(label, value, primary = false) {
  if (!value && value !== 0) return "";
  return `<div class="spec">
    <span class="spec-key">${escHtml(label)}</span>
    <span class="spec-val${primary ? " primary" : ""}">${escHtml(String(value))}</span>
  </div>`;
}
 
function toggleCard(id) {
  if (expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  fetchComponents(); // re-render preserving expand state
}
 
// ── Filters ───────────────────────────────────────────────────────────────────
function setCategory(cat, btn) {
  state.category = cat;
  document.querySelectorAll("#cat-filters .filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  fetchComponents();
}
 
function setType(type, btn) {
  state.type = type;
  document.querySelectorAll("#type-filters .filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  fetchComponents();
}
 
function toggleFilter(key) {
  if (key === "modular")     state.modular     = !state.modular;
  if (key === "compressor")  state.compressor  = !state.compressor;
  document.getElementById(`toggle-${key}`).classList.toggle("on",
    key === "modular" ? state.modular : state.compressor);
  fetchComponents();
}
 
function applyFilters() {
  state.minOutput = document.getElementById("min-output").value;
  state.maxOutput = document.getElementById("max-output").value;
  fetchComponents();
}
 
function clearFilters() {
  state = { query: "", category: "all", type: "all", sort: "output_desc",
            modular: false, compressor: false, minOutput: "", maxOutput: "" };
  document.getElementById("search-input").value = "";
  document.getElementById("sort-select").value  = "output_desc";
  document.getElementById("min-output").value   = "";
  document.getElementById("max-output").value   = "";
  document.getElementById("toggle-modular").classList.remove("on");
  document.getElementById("toggle-compressor").classList.remove("on");
  document.querySelectorAll("#cat-filters .filter-btn").forEach((b,i) => b.classList.toggle("active", i===0));
  document.querySelectorAll("#type-filters .filter-btn").forEach((b,i) => b.classList.toggle("active", i===0));
  fetchComponents();
}
 
// ── Chat ──────────────────────────────────────────────────────────────────────
function appendMsg(role, text) {
  const box  = document.getElementById("chat-messages");
  const div  = document.createElement("div");
  div.className = `msg ${role}`;
  // Render basic markdown-like formatting
  div.innerHTML = formatMsg(text);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}
 
function formatMsg(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/<li>/g, "<ul><li>").replace(/<\/li>(?![\s\S]*<\/li>)/, "</li></ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
}
 
async function sendChat() {
  const input = document.getElementById("chat-input");
  const msg   = input.value.trim();
  if (!msg) return;
 
  input.value = "";
  autoResize(input);
  document.getElementById("suggestions").style.display = "none";
  document.getElementById("send-btn").disabled = true;
 
  appendMsg("user", msg);
  chatHistory.push({ role: "user", content: msg });
 
  const thinking = appendMsg("thinking", "Thinking…");
 
  const res = await fetch("/api/chat", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message:          msg,
      history:          chatHistory.slice(-10),
      current_query:    state.query,
      current_category: state.category,
      current_sort:     state.sort,
    }),
  });
  const data = await res.json();
  thinking.remove();
 
  const reply = data.reply || data.error || "Something went wrong.";
  appendMsg("assistant", reply);
  chatHistory.push({ role: "assistant", content: reply });
  document.getElementById("send-btn").disabled = false;
}
 
function sendSuggestion(btn) {
  document.getElementById("chat-input").value = btn.textContent.trim();
  sendChat();
}
 
function askAbout(evt, id, name) {
  evt.stopPropagation();
  document.getElementById("suggestions").style.display = "none";
  document.getElementById("chat-input").value =
    `Tell me more about the ${name}. What are its key advantages and limitations?`;
  document.getElementById("chat-input").focus();
}
 
function chatKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
}
 
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 100) + "px";
}
 
// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}
function escAttr(s) { return String(s ?? "").replace(/'/g, "\\'"); }
 
// ── Init ──────────────────────────────────────────────────────────────────────
fetchComponents();