// main.js — orchestration: load data -> fetch forecast -> render map -> diagnose -> act.
// Drives the broadcast UI: day strip, scrolling ticker, auto-cycling right rail.
import { CONFIG, DOW, DOW_LONG } from "./config.js";
import { fetchForecast } from "./forecast.js";
import { demandField, weekFields } from "./model.js";
import { diagnose, pickHeadlineDay } from "./diagnose.js";
import { buildBrief, fireAction, headlineText, usd, pct } from "./action.js";
import { IsobarMap } from "./isobars.js";
import { md, renderScatter, reallocTable, tickerHTML, railCardHTML } from "./ui.js";

const $ = (id) => document.getElementById(id);

const state = {
  catId: "cold_refreshment",
  day: 0,
  playing: false,
  ctx: null,
  cats: {},
  map: null,
  rail: { list: [], idx: 0, timer: null },
};

async function boot() {
  setStatus("LOADING MODEL + MEDIA PLAN…");
  const [metros, mediaPlan, categories, coefficients, normals] = await Promise.all([
    j("./data/metros.json"),
    j("./data/media_plan.json"),
    j("./data/categories.json"),
    j("./data/coefficients.json"),
    j("./data/normals.json"),
  ]);

  setStatus("FETCHING LIVE FORECAST…");
  const forecast = await fetchForecast(metros);
  state.ctx = { metros, mediaPlan, categories, coefficients, normals, forecast };

  $("source-badge").textContent =
    forecast.source === "live" ? "● LIVE FORECAST" : "● CACHED SNAPSHOT";
  $("source-badge").className = "badge " + forecast.source;

  state.map = new IsobarMap($("map"));
  await state.map.init();

  for (const id of Object.keys(coefficients.categories)) {
    const week = weekFields(state.ctx, id);
    const diag = forecast.dates.map((_, i) =>
      diagnose(week[i], mediaPlan, i, forecast.dates)
    );
    state.cats[id] = { week, diag };
  }

  buildTabs();
  buildDayStrip();
  startClock();
  wireControls();

  const head = pickHeadlineDay(state.cats[state.catId].diag);
  setCategory(state.catId, head.dayIndex);
  setStatus("");
}

// ---------- rendering ----------
function setCategory(id, day = state.day) {
  state.catId = id;
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.cat === id)
  );
  document.documentElement.style.setProperty("--accent", state.ctx.categories[id].accent);
  $("railcat").textContent = state.ctx.categories[id].label;
  // tune the colour/contour scale to this category's actual demand range
  state.map.setScale(categoryScale(id));
  refreshDayStripTemps();
  setDay(day);
}

// 85th-percentile of |demand_delta| across the week -> vivid map without
// letting a single outlier metro flatten everything else.
function categoryScale(id) {
  const abs = [];
  for (const field of state.cats[id].week) for (const p of field) abs.push(Math.abs(p.value));
  abs.sort((a, b) => a - b);
  const p85 = abs[Math.floor(abs.length * 0.85)] || 5;
  return Math.max(5, p85);
}

function setDay(day) {
  state.day = Math.round(day);
  const field = state.cats[state.catId].week[state.day];
  state.map.render(field);
  const diag = state.cats[state.catId].diag[state.day];

  state.map.setMarkers(pickFlagged(diag), (row) => openDrawer(row));
  updateTitle(diag);
  updateAlert(diag);
  updateDayStrip();
  updateTicker(diag);
  startRail(diag);
  if ($("drawer").classList.contains("open")) renderDrawer(diag);
}

function pickFlagged(diag) {
  const set = new Map();
  [diag.headline, ...diag.pushIn.slice(0, 2), ...diag.pullOut.slice(0, 2)].forEach(
    (r) => r && !set.has(r.id) && set.set(r.id, r)
  );
  return [...set.values()].slice(0, 5);
}

function updateTitle(diag) {
  const cat = state.ctx.categories[state.catId];
  const dow = DOW_LONG[new Date(diag.date + "T00:00:00Z").getUTCDay()];
  const dlabel = state.day === 0 ? "Today" : `Day +${state.day}`;
  $("title").innerHTML =
    `Where demand is heading — <b>${cat.label}</b><span class="sub">${dlabel} · ${dow} ${fmtDate(diag.date)}</span>`;
}

function updateAlert(diag) {
  const cat = state.ctx.coefficients.categories[state.catId];
  const h = diag.headline;
  $("alert").innerHTML =
    `<span class="ico">⚠️</span>
     <span class="atext"><b>${headlineText(diag, cat)}</b><br/>
     demand ${pct(h.value)} vs normal · ${usd(diag.reallocation)} reallocation ready</span>
     <span class="cta">TAP →</span>`;
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
      `<div class="dow">${i === 0 ? "TODAY" : DOW[d.getUTCDay()]}</div>
       <div class="dnum">${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</div>
       <div class="dtemp" data-temp></div>`;
    chip.onclick = () => { stop(); setDay(i); };
    strip.appendChild(chip);
  });
}

function refreshDayStripTemps() {
  // show the headline metro's projected °F per day for the active category, for texture
  const week = state.cats[state.catId].week;
  document.querySelectorAll("#daystrip .daychip").forEach((chip) => {
    const i = +chip.dataset.day;
    const field = week[i];
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
  $("tickertrack").innerHTML = tickerHTML(diag, state.ctx.categories[state.catId].label);
  // restart marquee so width recalcs cleanly
  const t = $("tickertrack");
  t.style.animation = "none";
  void t.offsetWidth;
  t.style.animation = "";
}

// ---------- right rail (auto-cycling) ----------
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
    ...state.ctx.coefficients.categories[state.catId],
    ...state.ctx.categories[state.catId],
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
  const dots = $("raildots");
  dots.innerHTML = state.rail.list.map(() => "<i></i>").join("");
}

// pause cycling while the user hovers the card
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
    // focus the rail on the clicked metro too
    const i = state.rail.list.findIndex((r) => r.id === focusRow.id);
    if (i >= 0) { state.rail.idx = i; showRailCard(); }
  }
  renderDrawer(diag);
  $("drawer").classList.add("open");
}
function closeDrawer() { $("drawer").classList.remove("open"); }

function renderDrawer(diag) {
  const cat = state.ctx.coefficients.categories[state.catId];
  const catMeta = { ...cat, ...state.ctx.categories[state.catId] };
  const brief = buildBrief(diag, catMeta, state.ctx.forecast.source);
  $("briefBody").innerHTML = md(brief);
  $("realloc").innerHTML = reallocTable(diag);
  renderScatter($("scatter"), cat);
  $("evidenceNote").textContent =
    `Calibrated on ${cat.n_days || "~1800"} days. Proxy article: ${cat.proxy_article}. ` +
    `Pageviews are a demand proxy, not sales; elasticity is a national average applied to each metro's local anomaly.`;
  state._brief = brief;
  state._diag = diag;
  state._catMeta = catMeta;
}

// ---------- controls ----------
function buildTabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  for (const [id, c] of Object.entries(state.ctx.categories)) {
    const b = document.createElement("button");
    b.dataset.cat = id;
    b.innerHTML = `<span class="ti">${c.icon}</span>${c.label}`;
    b.onclick = () => { stop(); setCategory(id); };
    tabs.appendChild(b);
  }
}

function wireControls() {
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
    ...state.ctx.coefficients.categories[state.catId],
    ...state.ctx.categories[state.catId],
  };
  if (btn) btn.disabled = true;
  const res = await fireAction(diag, catMeta);
  if ($("drawer").classList.contains("open"))
    $("actionStatus").textContent = (res.mode === "slack" ? "📨 " : "✉️ ") + res.detail;
  if (btn) { btn.disabled = false; flash(btn, res.mode === "slack" ? "Sent ✓" : "Draft ✓"); }
  else flash($("fireRail"), res.mode === "slack" ? "SENT ✓" : "DRAFT ✓");
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ---------- clock ----------
function startClock() {
  const tick = () => {
    $("clock").textContent = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
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
function setStatus(msg) {
  $("boot").textContent = msg;
  $("boot").style.display = msg ? "flex" : "none";
}
function flash(el, msg) {
  const old = el.textContent;
  el.textContent = msg;
  setTimeout(() => (el.textContent = old), 1600);
}

boot().catch((e) => {
  console.error(e);
  setStatus("SOMETHING BROKE: " + e.message);
});
