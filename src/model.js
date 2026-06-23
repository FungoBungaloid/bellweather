// model.js — forecast -> demand departure from normal.
//   anomaly(metro,day)   = forecast - climatological_normal(metro, day-of-year)
//   demand_delta(cat,..) = elasticity(cat) * anomaly
// demand_delta is a unitless % departure from baseline demand (the isobar scalar).

function dayOfYear(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000); // 1..366
}

// Per-city point field for one category + one (possibly fractional) day index.
// ctx: { region(locked city subset), normals, coefficients, forecast }
export function demandField(ctx, categoryId, dayFloat) {
  const { region, normals, coefficients, forecast } = ctx;
  const cat = coefficients.categories[categoryId];
  const elasticity = cat.elasticity;
  const driver = cat.driver; // "temperature_2m_max"
  const dates = forecast.dates;
  const lo = Math.max(0, Math.min(dates.length - 1, Math.floor(dayFloat)));
  const hi = Math.min(dates.length - 1, lo + 1);
  const frac = dayFloat - lo;

  return region
    .map((m) => {
      const f = forecast.byMetro[m.id];
      const norm = normals[m.id] && normals[m.id][driver];
      if (!f || !norm) return null;
      const t = f.tmax[lo] * (1 - frac) + f.tmax[hi] * frac;
      const doy = dayOfYear(dates[Math.round(dayFloat)] || dates[lo]);
      const normal = norm[Math.min(365, doy - 1)];
      const anomaly = t - normal;
      return {
        id: m.id,
        name: m.name,
        state: m.state,
        lat: m.lat,
        lon: m.lon,
        population: m.population,
        tmax: t,
        normal,
        anomaly,
        value: elasticity * anomaly, // demand_delta, %
      };
    })
    .filter(Boolean);
}

// Whole-week field for a category: array indexed by day -> point field.
export function weekFields(ctx, categoryId) {
  return ctx.forecast.dates.map((_, i) => demandField(ctx, categoryId, i));
}
