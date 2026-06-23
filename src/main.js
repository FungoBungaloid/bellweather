// main.js — orchestration. Globe (aim a region) → lock in → fetch forecast →
// model demand field → render regional isobar map → diagnose → act.
import { CONFIG, DOW, DOW_LONG } from "./config.js?v=3";
import { fetchForecast } from "./forecast.js?v=3";
import { demandField, weekFields } from "./model.js?v=3";
import { diagnose, pickHeadlineDay } from "./diagnose.js?v=3";
import { buildBrief, fireAction, headlineText, usd, pct } from "./action.js?v=3";
import { IsobarMap } from "./isobars.js?v=3";
import { Globe } from "./globe.js?v=3";
import { md, renderScatter, reallocTable, tickerHTML, railCardHTML, actionCardHTML } from "./ui.js?v=3";

const $ = (id) => document.getElementById(id);

const state = {
  catId: "ice_cream",
  day: 0,
  playing: false,
  data: null, // { cities, mediaPlan, categories, coefficients, normals }
  ctx: null, // per-lock: { region, normals, coefficients, forecast }
  cats: {}, // per-lock per-product: { week, diag }
  map: null,
  globe: null,
  regionName: "—",
  aimSel: [],
  rail: { list: [], idx: 0, timer: null },
};

// ---------- boot ----------
async function boot() {
  setBoot("Loading the model + media plan…");
  const [cities, mediaPlan, categories, coefficients, normals] = await Promise.all([
    j("./data/cities.json"),
    j("./data/media_plan.json"),
    j("./data/categories.json"),
    j("./data/coefficients.json"),
    j("./data/normals.json"),
  ]);
  state.data = { cities, mediaPlan, categories, coefficients, normals };

  // map gets set up once (loads basemap); it only renders after a region locks.
  state.map = new IsobarMap($("map"));
  await state.map.init();

  buildGallery("globeGallery", false);
  buildGallery("forecastGallery", true);

  state.globe = new Globe($("globe"), cities, { onAim: onAim });
  state.globe.init();

  wireControls();
  startClock();
  setBoot("");
}

// ---------- globe / aim ----------
function onAim(sel) {
  if (!state.globe) return;
  state.aimSel = sel;
  const name = state.globe.regionLabel(sel);
  state.regionName = name;
  const names = sel.slice(0, 3).map((m) => m.name).join(", ");
  $("aimReadout").innerHTML =
    `<b>${name}</b> · ${sel.length} markets<br/><span class="sub">${names}${sel.length > 3 ? " …" : ""}</span>`;
}

async function lockIn() {
  const sel = state.globe.selection();
  if (!sel.length) return;
  state.globe.stopAuto();
  const name = state.globe.regionLabel(sel);
  state.regionName = name;

  setBoot(`Locking ${name} · fetching forecast…`);
  const forecast = await fetchForecast(sel);
  state.ctx = {
    region: sel,
    normals: state.data.normals,
    coefficients: state.data.coefficients,
    forecast,
  };

  // precompute every product's week + diagnosis for this region
  state.cats = {};
  for (const id of Object.keys(state.data.coefficients.categories)) {
    const week = weekFields(state.ctx, id);
    const diag = forecast.dates.map((_, i) =>
      diagnose(week[i], state.data.mediaPlan, i, forecast.dates)
    );
    state.cats[id] = { week, diag };
  }

  state.map.setRegion(sel);

  $("source-badge").textContent = forecast.source === "live" ? "Live" : "Snapshot";
  $("source-badge").className = "chip " + forecast.source;
  $("ctxRegion").textContent = name;

  buildDayStrip();
  document.body.className = "forecast";

  const head = pickHeadlineDay(state.cats[state.catId].diag);
  setCategory(state.catId, head.dayIndex);
  setBoot("");
}

function backToGlobe() {
  stop();
  clearInterval(state.rail.timer);
  document.body.className = "globe";
  state.globe.onResize();
  state.globe.startAuto();
}

// ---------- product gallery ----------
function buildGallery(containerId, isRow) {
  const el = $(containerId);
  el.innerHTML = "";
  for (const [id, c] of Object.entries(state.data.categories)) {
    const co = state.data.coefficients.categories[id] || {};
    const e = co.elasticity || 0;
    const meta = `${e >= 0 ? "+" : ""}${e} %/°C · r² ${(co.r2 ?? 0).toString().replace(/^0/, "")}`;
    const b = document.createElement("button");
    b.className = "tile";
    b.dataset.cat = id;
    b.style.setProperty("--tile-accent", c.accent);
    b.innerHTML =
      `<span class="tile-ico">${c.icon}</span>` +
      `<span class="tile-name">${c.label}</span>` +
      `<span class="tile-meta">${meta}</span>`;
    b.onclick = () => onPickProduct(id, isRow);
    el.appendChild(b);
  }
  syncGalleryActive();
}

function onPickProduct(id, isRow) {
  if (isRow) { stop(); setCategory(id); } // on the forecast screen, switch live
  else { state.catId = id; syncGalleryActive(); } // on the globe screen, just select
}

function syncGalleryActive() {
  document.querySelectorAll(".tile").forEach((b) =>
    b.classList.toggle("active", b.dataset.cat === state.catId)
  );
}

// ---------- forecast rendering ----------
function setCategory(id, day = state.day) {
  state.catId = id;
  syncGalleryActive();
  const cat = state.data.categories[id];
  document.documentElement.style.setProperty("--accent", cat.accent);
  $("railcat").textContent = cat.label;
  $("ctxProd").textContent = cat.label;
  state.map.setScale(categoryScale(id));
  refreshDayStripTemps();
  setDay(day);
}

function categoryScale(id) {
  const abs = [];
  for (const field of state.cats[id].week) for (const p of field) abs.push(Math.abs(p.value));
  abs.sort((a, b) => a - b);
  // 65th percentile: saturates the field so the map reads vividly for every
  // product, instead of high-elasticity lines washing out near the centre.
  const p = abs[Math.floor(abs.length * 0.65)] || 5;
  return Math.max(4, p);
}

function setDay(day) {
  state.day = Math.round(day);
  const field = state.cats[state.catId].week[state.day];
  state.map.render(field);
  const diag = state.cats[state.catId].diag[state.day];

  state.map.setMarkers(pickFlagged(diag), (row) => openDrawer(row));
  updateTitle(diag);
  updateAlert(diag);
  updateLoop(diag);
  updateDayStrip();
  updateTicker(diag);
  startRail(diag);
  if ($("drawer").classList.contains("open")) renderDrawer(diag);
}

// end-to-end loop indicator: signal → intelligence → action
function updateLoop(diag, fired) {
  const src = state.ctx ? state.ctx.forecast.source : "—";
  const gaps = diag ? diag.ranked.filter((r) => r.kind !== "aligned").length : 0;
  $("loop").innerHTML =
    `<i class="on">Signal ${src === "live" ? "live" : "cache"}</i>` +
    `<i class="on">Intel ${gaps} gaps</i>` +
    `<i class="${fired ? "act" : ""}">Action ${fired ? "sent" : "ready"}</i>`;
}

function pickFlagged(diag) {
  const set = new Map();
  [diag.headline, ...diag.pushIn.slice(0, 2), ...diag.pullOut.slice(0, 2)].forEach(
    (r) => r && !set.has(r.id) && set.set(r.id, r)
  );
  return [...set.values()].slice(0, 5);
}

function updateTitle(diag) {
  const cat = state.data.categories[state.catId];
  const dow = DOW_LONG[new Date(diag.date + "T00:00:00Z").getUTCDay()];
  const dlabel = state.day === 0 ? "Today" : `Day +${state.day}`;
  $("title").innerHTML =
    `<div class="kick">${state.regionName} · ${dlabel}</div>` +
    `<div class="big">Where demand is heading — <b>${cat.label}</b></div>` +
    `<div class="sub">${dow} ${fmtDate(diag.date)}</div>`;
}

function updateAlert(diag) {
  const cat = state.data.coefficients.categories[state.catId];
  const h = diag.headline;
  $("alert").innerHTML =
    `<span class="bar"></span>` +
    `<span class="atext"><span class="h">${headlineText(diag, cat)}</span><br/>` +
    `<span class="mono">demand ${pct(h.value)} vs normal · ${usd(diag.reallocation)} reallocation ready</span></span>` +
    `<span class="cta">OPEN →</span>`;
}

// ---------- day strip ----------
function buildDayStrip() {
  const strip = $("daystrip");
  strip.innerHTML = "";
  state.ctx.forecast.dates.forEach((iso, i) => {
    const d = new Date(iso + "T00:00:00Z");
    const chip = document.createElement("div");
    chip.className = "daychip";
    chip.dataset.day = i;
    chip.innerHTML =
      `<div class="dow">${i === 0 ? "TODAY" : DOW[d.getUTCDay()]}</div>` +
      `<div class="dnum">${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</div>` +
      `<div class="dtemp" data-temp></div>`;
    chip.onclick = () => { stop(); setDay(i); };
    strip.appendChild(chip);
  });
}

function refreshDayStripTemps() {
  const week = state.cats[state.catId].week;
  document.querySelectorAll("#daystrip .daychip").forEach((chip) => {
    const i = +chip.dataset.day;
    const field = week[i];
    if (!field || !field.length) return;
    const hot = field.reduce((a, b) => (b.tmax > a.tmax ? b : a), field[0]);
    chip.querySelector("[data-temp]").textContent = `${Math.round((hot.tmax * 9) / 5 + 32)}°`;
  });
}

function updateDayStrip() {
  document.querySelectorAll("#daystrip .daychip").forEach((chip) =>
    chip.classList.toggle("active", +chip.dataset.day === state.day)
  );
}

// ---------- ticker ----------
function updateTicker(diag) {
  $("tickertrack").innerHTML = tickerHTML(diag, state.data.categories[state.catId].label);
  const t = $("tickertrack");
  t.style.animation = "none";
  void t.offsetWidth;
  t.style.animation = "";
}

// ---------- right rail ----------
function startRail(diag) {
  clearInterval(state.rail.timer);
  const list = diag.ranked.filter((r) => r.kind !== "aligned").slice(0, 6);
  state.rail = { list: list.length ? list : diag.ranked.slice(0, 5), idx: 0, timer: null };
  buildDots();
  showRailCard();
  state.rail.timer = setInterval(() => {
    state.rail.idx = (state.rail.idx + 1) % state.rail.list.length;
    showRailCard();
  }, 4200);
}

function showRailCard() {
  const r = state.rail.list[state.rail.idx];
  if (!r) return;
  const catMeta = {
    ...state.data.coefficients.categories[state.catId],
    ...state.data.categories[state.catId],
  };
  const card = $("railcard");
  card.classList.remove("in");
  void card.offsetWidth;
  card.innerHTML = railCardHTML(r, catMeta);
  card.classList.add("in");
  card.onclick = () => openDrawer(r);
  document.querySelectorAll("#raildots i").forEach((d, k) =>
    d.classList.toggle("on", k === state.rail.idx)
  );
}

function buildDots() {
  $("raildots").innerHTML = state.rail.list.map(() => "<i></i>").join("");
}

function wireRailHover() {
  const card = $("railcard");
  card.addEventListener("mouseenter", () => clearInterval(state.rail.timer));
  card.addEventListener("mouseleave", () => {
    clearInterval(state.rail.timer);
    state.rail.timer = setInterval(() => {
      state.rail.idx = (state.rail.idx + 1) % state.rail.list.length;
      showRailCard();
    }, 4200);
  });
}

// ---------- drawer ----------
function openDrawer(focusRow) {
  const diag = state.cats[state.catId].diag[state.day];
  if (focusRow) {
    const i = state.rail.list.findIndex((r) => r.id === focusRow.id);
    if (i >= 0) { state.rail.idx = i; showRailCard(); }
  }
  renderDrawer(diag);
  $("drawer").classList.add("open");
}
function closeDrawer() { $("drawer").classList.remove("open"); }

function renderDrawer(diag) {
  const cat = state.data.coefficients.categories[state.catId];
  const catMeta = { ...cat, ...state.data.categories[state.catId] };
  const brief = buildBrief(diag, catMeta, state.ctx.forecast.source);
  $("actioncard").innerHTML = actionCardHTML(diag, catMeta);
  $("briefBody").innerHTML = md(brief);
  $("realloc").innerHTML = reallocTable(diag);
  renderScatter($("scatter"), catMeta);
  $("evidenceNote").textContent =
    `Calibrated on ${cat.n_days || "~1800"} days. Proxy article: ${cat.proxy_article}. ` +
    `Pageviews are a demand proxy, not sales; elasticity is a national average applied to each market's local anomaly.`;
  state._brief = brief;
  state._diag = diag;
  state._catMeta = catMeta;
}

// ---------- controls ----------
function wireControls() {
  $("lockBtn").onclick = () => lockIn();
  $("newRegion").onclick = backToGlobe;
  $("backWord").onclick = backToGlobe;
  $("play").onclick = togglePlay;
  $("alert").onclick = () => openDrawer();
  $("openDrawer").onclick = () => openDrawer();
  $("fireRail").onclick = () => fireFromState();
  $("drawerClose").onclick = closeDrawer;
  $("cbToggle").onchange = (e) => state.map.setColorblind(e.target.checked);
  $("fsBtn").onclick = toggleFullscreen;
  wireRailHover();

  $("copy").onclick = async () => {
    if (!state._brief) renderDrawer(state.cats[state.catId].diag[state.day]);
    await navigator.clipboard.writeText(state._brief || "");
    flash($("copy"), "Copied ✓");
  };
  $("download").onclick = () => {
    if (!state._brief) renderDrawer(state.cats[state.catId].diag[state.day]);
    const blob = new Blob([state._brief || ""], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bellwether-brief-${state.catId}-${state._diag.date}.md`;
    a.click();
  };
  $("fire").onclick = () => fireFromState($("fire"));
}

async function fireFromState(btn) {
  const diag = state.cats[state.catId].diag[state.day];
  const catMeta = {
    ...state.data.coefficients.categories[state.catId],
    ...state.data.categories[state.catId],
  };
  if (btn) btn.disabled = true;
  const res = await fireAction(diag, catMeta);
  diag._fired = true;
  updateLoop(diag, true);
  if ($("drawer").classList.contains("open")) {
    $("actioncard").innerHTML = actionCardHTML(diag, catMeta);
    $("actionStatus").textContent = (res.mode === "slack" ? "📨 " : "✉️ ") + res.detail;
  }
  if (btn) { btn.disabled = false; flash(btn, res.mode === "slack" ? "Sent ✓" : "Draft ✓"); }
  else flash($("fireRail"), res.mode === "slack" ? "Sent ✓" : "Draft ✓");
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ---------- clock ----------
function startClock() {
  const tick = () => {
    $("clock").textContent = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- play / animation ----------
let raf = null;
let lastIntDay = -1;
function togglePlay() { state.playing ? stop() : play(); }
function play() {
  state.playing = true;
  $("play").textContent = "❚❚";
  const n = state.ctx.forecast.dates.length;
  const dur = 1100;
  let t0 = null;
  let startDay = state.day >= n - 1 ? 0 : state.day;
  lastIntDay = Math.round(startDay);
  const step = (ts) => {
    if (!state.playing) return;
    if (t0 === null) t0 = ts;
    let f = startDay + (ts - t0) / dur;
    if (f >= n - 1) { renderFloat(n - 1); stop(); setDay(n - 1); return; }
    renderFloat(f);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function renderFloat(f) {
  const field = demandField(state.ctx, state.catId, f);
  state.map.render(field);
  const di = Math.round(f);
  updateTitle({ ...state.cats[state.catId].diag[di], date: state.ctx.forecast.dates[di] });
  if (di !== lastIntDay) {
    lastIntDay = di;
    document.querySelectorAll("#daystrip .daychip").forEach((c) =>
      c.classList.toggle("active", +c.dataset.day === di)
    );
    const diag = state.cats[state.catId].diag[di];
    updateTicker(diag);
    startRail(diag);
  }
}
function stop() {
  state.playing = false;
  $("play").textContent = "▶";
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}

// ---------- utils ----------
function j(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  });
}
function fmtDate(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}
function setBoot(msg) {
  const el = $("boot");
  el.style.display = msg ? "flex" : "none";
  const sub = el.querySelector(".bs");
  if (sub && msg) sub.textContent = msg;
}
function flash(el, msg) {
  const old = el.textContent;
  el.textContent = msg;
  setTimeout(() => (el.textContent = old), 1600);
}

boot().catch((e) => {
  console.error(e);
  setBoot("Something broke: " + e.message);
});
