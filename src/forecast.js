// forecast.js — live, batched, keyless Open-Meteo forecast fetch (browser-side).
// Works for ANY set of cities (a locked region), and falls back to a cached
// snapshot so the demo never shows a blank map.
import { CONFIG } from "./config.js?v=3";

// Returns { source, dates:[ISO...], byMetro: { id: { tmax:[], precip:[] } } }
export async function fetchForecast(cities) {
  const lats = cities.map((m) => m.lat).join(",");
  const lons = cities.map((m) => m.lon).join(",");
  const url =
    `${CONFIG.forecastEndpoint}?latitude=${lats}&longitude=${lons}` +
    `&daily=temperature_2m_max,precipitation_sum&forecast_days=${CONFIG.forecastDays}` +
    `&temperature_unit=celsius&timezone=auto`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let json = await res.json();
    // Single coord returns an object; batch returns an array. Normalise.
    if (!Array.isArray(json)) json = [json];
    return shapeLive(cities, json);
  } catch (err) {
    console.warn("Live forecast failed, using snapshot:", err.message);
    return shapeSnapshot(cities, await loadSnapshot());
  }
}

let _snapshot = null;
async function loadSnapshot() {
  if (!_snapshot)
    _snapshot = await fetch("./data/forecast_snapshot.json").then((r) => r.json());
  return _snapshot;
}

// Live batch preserves request order, so map positionally.
function shapeLive(cities, arr) {
  const byMetro = {};
  let dates = [];
  cities.forEach((m, i) => {
    const d = arr[i] && arr[i].daily;
    if (!d) return;
    dates = d.time;
    byMetro[m.id] = {
      tmax: d.temperature_2m_max,
      precip: d.precipitation_sum || d.temperature_2m_max.map(() => 0),
    };
  });
  return { source: "live", dates, byMetro };
}

// Snapshot is keyed by city id, so any region subset resolves directly.
function shapeSnapshot(cities, snap) {
  const byMetro = {};
  let dates = [];
  cities.forEach((m) => {
    const d = snap.byId && snap.byId[m.id];
    if (!d) return;
    dates = d.time;
    byMetro[m.id] = {
      tmax: d.temperature_2m_max,
      precip: d.precipitation_sum || d.temperature_2m_max.map(() => 0),
    };
  });
  return { source: "snapshot", dates, byMetro };
}
