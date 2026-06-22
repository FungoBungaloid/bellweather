// forecast.js — live, batched, keyless Open-Meteo forecast fetch (browser-side).
// Falls back to a cached snapshot so the demo never shows a blank map.
import { CONFIG } from "./config.js";

// Returns { source, dates:[ISO...], byMetro: { id: { tmax:[], precip:[] } } }
export async function fetchForecast(metros) {
  const lats = metros.map((m) => m.lat).join(",");
  const lons = metros.map((m) => m.lon).join(",");
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
    return shape(metros, json, "live");
  } catch (err) {
    console.warn("Live forecast failed, using snapshot:", err.message);
    const snap = await fetch("./data/forecast_snapshot.json").then((r) => r.json());
    return shape(metros, snap.metros, "snapshot");
  }
}

function shape(metros, arr, source) {
  const byMetro = {};
  let dates = [];
  metros.forEach((m, i) => {
    const d = arr[i] && arr[i].daily;
    if (!d) return;
    dates = d.time;
    byMetro[m.id] = {
      tmax: d.temperature_2m_max,
      precip: d.precipitation_sum || d.temperature_2m_max.map(() => 0),
    };
  });
  return { source, dates, byMetro };
}
