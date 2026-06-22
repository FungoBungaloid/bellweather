// config.js — all the dials in one place. No secrets here; never put keys client-side.

export const CONFIG = {
  // Notional total budget for the active flight, used to size dollar moves.
  flightBudget: 2_000_000,

  // Forecast horizon (Open-Meteo gives up to 16; demo uses 7).
  forecastDays: 7,

  // Map / interpolation
  mapWidth: 960,
  mapHeight: 600,
  gridX: 110, // IDW grid columns
  gridY: 70, // IDW grid rows
  idwPower: 2.2,

  // Contour thresholds (% demand departure from normal), symmetric around 0.
  thresholds: [-40, -30, -22, -16, -11, -7, -4, 4, 7, 11, 16, 22, 30, 40],
  frontThreshold: 4, // the "demand front": where normal crosses into surge

  // Action delivery. If slackWorkerUrl is set, the app POSTs there (a tiny
  // Cloudflare Worker forwards to a Slack incoming webhook). Otherwise it
  // falls back to a prefilled mailto: draft — works everywhere, no backend.
  slackWorkerUrl: "", // e.g. "https://bellwether-slack.your-subdomain.workers.dev"
  fallbackEmailDomain: "brand-media.example",

  // Public app URL used in the Slack/email deep link (set after you deploy).
  appUrl: "https://your-org.github.io/bellwether/",

  // Local basemap (states TopoJSON) — vendored, no CDN dependency.
  statesTopoUrl: "./data/states-10m.json",

  // Live forecast endpoint (keyless, CORS-OK).
  forecastEndpoint: "https://api.open-meteo.com/v1/forecast",
};

// Day-of-week labels for headlines ("Thu").
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
