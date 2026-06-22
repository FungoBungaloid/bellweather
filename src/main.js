// main.js — orchestration: load data -> fetch forecast -> render map -> diagnose -> act.
import { CONFIG, DOW_LONG } from "./config.js";
import { fetchForecast } from "./forecast.js";
import { demandField, weekFields } from "./model.js";
import { diagnose, pickHeadlineDay } from "./diagnose.js";
import { buildBrief, fireAction, headlineText, slackMessage, usd, pct, cToF } from "./action.js";
import { IsobarMap } from "./isobars.js";
import { md, renderScatter, reallocTable } from "./ui.js";

const $ = (id) => document.getElementById(id);

const state = {
  catId: "cold_refreshment",
  day: 0,
  playing: false,
  ctx: null, // { metros, mediaPlan, categories, coefficients, normals, forecast }
  cats: {}, // per-category { week:[fields], diag:[diagnoses] }
  map: null,
};

async function boot() {
  setStatus("Loading model + media plan…");
  const [metros, mediaPlan, categories, coefficients, normals] = await Promise.all([
    j("./data/metros.json"),
    j("./data/media_plan.json"),
    j("./data/categories.json"),
    j("./data/coefficients.json"),
    j("./data/normals.json"),
  ]);

  setStatus("Fetching live forecast…");
  const forecast = await fetchForecast(metros);
  state.ctx = { metros, mediaPlan, categories, coefficients, normals, forecast };

  // source badge
  $("source-badge").textContent =
    forecast.source === "live" ? "● LIVE forecast" : "● cached snapshot";
  $("source-badge").className = "badge " + forecast.source;

  // map
  state.map = new IsobarMap($("map"));
  await state.map.init();

  // precompute both categories
  for (const id of Object.keys(coefficients.categories)) {
    const week = weekFields(state.ctx, id);
    const diag = forecast.dates.map((_, i) =>
      diagnose(week[i], mediaPlan, i, forecast.dates)
    );
    state.cats[id] = { week, diag };
  }

  // category tabs
  buildTabs();

  // scrubber bounds
  const n = forecast.dates.length;
  $("scrub").max = n - 1;

  // open on the punchiest day for the default category
  const head = pickHeadlineDay(state.cats[state.catId].diag);
  setCategory(state.catId, head.dayIndex);

  wireControls();
  setStatus("");
}

// ---------- rendering ----------
function setCategory(id, day = state.day) {
  state.catId = id;
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.cat === id)
  );
  document.documentElement.style.setProperty(
    "--accent",
    state.ctx.categories[id].accent
  );
  setDay(day);
}

function setDay(day) {
  state.day = Math.round(day);
  $("scrub").value = state.day;
  const field = state.cats[state.catId].week[state.day];
  state.map.render(field);
  const diag = state.cats[state.catId].diag[state.day];

  // markers: top opportunities for the day
  const flagged = pickFlagged(diag);
  state.map.setMarkers(flagged, (row) => openDrawer(row));

  updateTitle(diag);
  updateAlert(diag);
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
  const dir = h.value >= 0 ? "surge" : "dip";
  $("alert").innerHTML =
    `<span class="ico">⚠️</span>
     <span class="atext"><b>${headlineText(diag, cat)}</b>
     demand ${pct(h.value)} vs normal · ${usd(diag.reallocation)} move ready</span>
     <span class="cta">Tap →</span>`;
  $("alert").dataset.dir = dir;
}

// ---------- drawer ----------
function openDrawer(focusRow) {
  const diag = state.cats[state.catId].diag[state.day];
  renderDrawer(diag, focusRow);
  $("drawer").classList.add("open");
}
function closeDrawer() {
  $("drawer").classList.remove("open");
}

function renderDrawer(diag, focusRow) {
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
  state._catMeta = cat;
}

// ---------- controls ----------
function buildTabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  for (const [id, c] of Object.entries(state.ctx.categories)) {
    const b = document.createElement("button");
    b.dataset.cat = id;
    b.innerHTML = `<span class="ti">${c.icon}</span>${c.label}`;
    b.onclick = () => {
      stop();
      setCategory(id);
    };
    tabs.appendChild(b);
  }
}

function wireControls() {
  $("scrub").oninput = (e) => {
    stop();
    setDay(+e.target.value);
  };
  $("play").onclick = togglePlay;
  $("details").onclick = () => openDrawer();
  $("alert").onclick = () => openDrawer();
  $("drawerClose").onclick = closeDrawer;
  $("cbToggle").onchange = (e) => state.map.setColorblind(e.target.checked);

  $("copy").onclick = async () => {
    await navigator.clipboard.writeText(state._brief || "");
    flash($("copy"), "Copied ✓");
  };
  $("download").onclick = () => {
    const blob = new Blob([state._brief || ""], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bellwether-brief-${state.catId}-${state._diag.date}.md`;
    a.click();
  };
  $("fire").onclick = async () => {
    $("fire").disabled = true;
    const res = await fireAction(state._diag, state._catMeta);
    $("actionStatus").textContent =
      (res.mode === "slack" ? "📨 " : "✉️ ") + res.detail;
    $("fire").disabled = false;
    flash($("fire"), res.mode === "slack" ? "Sent to Slack ✓" : "Draft opened ✓");
  };
}

// ---------- play / animation ----------
let raf = null;
function togglePlay() {
  state.playing ? stop() : play();
}
function play() {
  state.playing = true;
  $("play").textContent = "❚❚";
  const n = state.ctx.forecast.dates.length;
  const dur = 1100; // ms per day
  let t0 = null;
  let startDay = state.day >= n - 1 ? 0 : state.day;
  const step = (ts) => {
    if (!state.playing) return;
    if (t0 === null) t0 = ts;
    const elapsed = ts - t0;
    let f = startDay + elapsed / dur;
    if (f >= n - 1) {
      f = n - 1;
      renderFloat(f);
      stop();
      setDay(n - 1);
      return;
    }
    renderFloat(f);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function renderFloat(f) {
  const field = demandField(state.ctx, state.catId, f);
  state.map.render(field);
  $("scrub").value = f;
  const di = Math.round(f);
  const diag = state.cats[state.catId].diag[di];
  updateTitle({ ...diag, date: state.ctx.forecast.dates[di] });
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
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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
  setStatus("Something broke: " + e.message);
});
