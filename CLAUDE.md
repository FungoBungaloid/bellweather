# CLAUDE.md — Bellwether

> **Working title:** Bellwether (a *bellwether* is a leading indicator; it also contains "weather"). Swap freely.
> **One line:** A weather map, but the fronts are demand. Bellwether watches the forecast across a brand's markets, projects where consumer demand is about to depart from normal, finds where the brand's media money *isn't* following that demand, and pushes the fix — before the weather arrives.
> **Built for:** AI & Tech Sandbox Global Hackathon 2026 — "Intelligence to Action" brief.

---

## 0. Read this first — what we are and are NOT building

**We ARE building** a single-page, static, browser-only web app (deployable to GitHub Pages) that:
1. Pulls a **live** multi-day weather forecast across ~40 US metros from a keyless API.
2. Converts forecast → **demand-departure-from-normal** per product category per metro, using **elasticities calibrated on real historical data** (precomputed at build time).
3. Renders the result as an **animated weather-style isobar map** ("demand fronts") that anyone can read on sight.
4. **Diagnoses** where projected demand is high but the brand's media weight is low (the gap that loses money).
5. **Acts**: generates a dollar-specific reallocation + a strategist-grade brief + fires a real Slack message to the responsible buyer.

**We are NOT building:** a dashboard, a login system, a database, a heavy backend, or anything that needs an API key exposed in the browser. The judges explicitly will *not* reward infrastructure complexity. Every moving part must demonstrably work on stage. When in doubt, cut scope, not reliability.

**The core discipline — "childlike on the surface, rigorous one tap down":** The front screen is *only* the map, a day scrubber, and one headline alert. The r², the gap math, the brief all live behind a single tap. If the front screen looks like a TV weather forecast a child could read, we've succeeded. Do not clutter it.

---

## 1. Why this wins (keep these framings in the UI copy and the deck)

The judging rubric has five axes. Build so each one has an obvious answer:

| Rubric axis | Our answer |
|---|---|
| **Problem Framing** | Everyone monitors *lagging internal* metrics (yesterday's sales). We monitor a *leading external* signal (the forecast) so you act *before* the number moves. "The distance between insight and action is where advantage is lost" — forecast lead time literally buys that distance back. |
| **Signal Quality** | Live, keyless national weather forecast. Not a static file. Calibrated against real multi-year historical demand data with an r² we show on screen. |
| **Intelligence Depth** | We don't summarize weather. We project demand *departure from normal* and cross-reference it against the brand's *actual media plan* to surface a quantified, ranked, dollar-sized gap. |
| **Action Quality** | A specific reallocation table + a localized creative brief + a real Slack push to the named buyer. Deployable as-is. |
| **Originality** | Weather-triggered advertising exists — but only as reactive creative-swaps *at the ad-server* ("show the rain ad when it rains"). Nobody operates *upstream at the planning layer with forecast lead time*. We built the strategist seat that's empty. The isobar map is a viz no marketer in the room can produce. |

**Positioning soundbite for the deck:** "Existing weather-marketing tools react when the weather arrives. Bellwether acts three days before it does."

---

## 2. The demand model (the rigorous core — get this right)

### 2.1 Concept
Demand for weather-sensitive categories moves when weather **departs from its local seasonal normal**, not on raw temperature. A 28°C day is a demand spike in Seattle and a Tuesday in Phoenix. So everything is computed as an **anomaly**.

```
anomaly(metro, day)      = forecast_value(metro, day) − climatological_normal(metro, day_of_year)
demand_delta(cat, metro, day) = elasticity(cat) × anomaly(metro, day)
```

`demand_delta` is a unitless **% departure from baseline demand**. Positive = demand surging above normal; negative = demand dipping below. This is the scalar the isobars contour.

### 2.2 Calibration — BUILD TIME ONLY (`scripts/calibrate.py`)
This is option B and the part that earns the "Signal Quality" score. **It runs once, locally, and writes `data/coefficients.json`. It is never called from the browser.**

For each category:
1. Pick a Wikipedia article that proxies category demand/attention (see §6 portfolio).
2. Fetch **daily pageviews** for that article over ~3–5 years from the Wikimedia Pageviews API (a documented Google-Trends alternative; data from 2015-07-01).
3. Fetch **daily historical temperature** (ERA5) for the same date range for a basket of reference cities from the Open-Meteo **archive** API.
4. Compute the weather anomaly per day (observed − the multi-year mean for that day-of-year).
5. Detrend/deseasonalize pageviews (subtract a rolling seasonal mean or day-of-year mean) to isolate the weather-driven residual.
6. **Linear regression**: demand residual ~ weather anomaly. Store `elasticity` (slope) and `r2`.
7. Persist a downsampled set of `(anomaly, demand_residual)` scatter points (~150) so the app can render the fit visually.

Output schema (`data/coefficients.json`):
```json
{
  "generated_at": "2026-06-22",
  "categories": {
    "cold_refreshment": {
      "label": "Cold Refreshment",
      "proxy_article": "Ice_cream",
      "driver": "temperature_2m_max",
      "elasticity": 1.84,            // % demand change per +1°C anomaly
      "r2": 0.71,
      "direction": "positive",
      "scatter": [[anomaly, residual], ...]
    },
    "warm_comfort": {
      "label": "Warm Comfort",
      "proxy_article": "Soup",
      "driver": "temperature_2m_max",
      "elasticity": -1.42,
      "r2": 0.58,
      "direction": "negative",
      "scatter": [[...]]
    }
  }
}
```

**Honesty guardrails (state these in the brief/deck, don't hide them):**
- Pageviews are a *demand proxy*, not sales. Label them as such.
- If a category's r² comes out weak (< ~0.3), swap the proxy article or driver variable rather than shipping a flat line. Try candidate articles and keep the best (see §6 for alternates).
- The elasticity is national-average; we apply it per-metro to the local anomaly. That's the documented simplification — say so.

### 2.3 Climatological normals (also build time, in `calibrate.py`)
For each metro, pull ~5 years of ERA5 daily data and compute the **day-of-year mean** for each driver variable → `data/normals.json` keyed by metro and day-of-year (1–366). The live app subtracts this from the forecast to get the anomaly. This keeps the runtime path free of any historical API calls.

---

## 3. Data sources (exact, verified, keyless)

### 3.1 Open-Meteo Forecast — RUNTIME, browser-side (CORS OK, no key)
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- **Batch all metros in one request** via comma-separated coords: `latitude=40.71,34.05,...&longitude=-74.01,-118.24,...`
- Params: `daily=temperature_2m_max,precipitation_sum&forecast_days=7&temperature_unit=celsius&timezone=auto`
- Returns a JSON array (one object per coordinate). 7 days default (up to 16).
- Free non-commercial ≤10k calls/day. **Attribution required (CC BY 4.0)** — put "Weather data by Open-Meteo.com" in the footer.

### 3.2 Open-Meteo Archive (ERA5) — BUILD TIME only
- Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- Same param vocabulary as forecast. `start_date`/`end_date`, `daily=temperature_2m_max`, ERA5 from 1940.

### 3.3 Wikimedia Pageviews — BUILD TIME only (Python, where User-Agent is settable)
- Endpoint pattern:
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/{ARTICLE}/daily/{YYYYMMDD}/{YYYYMMDD}`
- **Must send a `User-Agent` header** identifying the app (e.g. `Bellwether/1.0 (hackathon; contact@example.com)`). This is why calibration is Python/server-side, not browser — browsers forbid setting User-Agent in `fetch`.
- Daily granularity; data from 2015-07-01. Response: `{"items":[{"timestamp":"2021010100","views":7238}, ...]}`.
- URL-encode article titles; spaces → underscores.

---

## 4. The isobar visualization (the showpiece)

This is the "lean forward, I want this" moment. It must read instantly as a weather map.

### 4.1 Pipeline (all browser-side, runtime)
1. For the selected day, compute `demand_delta` at each of the ~40 metro points (forecast anomaly × elasticity for the active category).
2. **Interpolate** to a regular grid over the US using **Inverse Distance Weighting** (IDW, power ≈ 2). IDW chosen over kriging because it's a few lines, deterministic, and explainable ("nearby cities pull the value toward them"). Grid ≈ 120×75 cells over the albersUsa bounding box.
3. **Contour** the grid with `d3-contour` (`d3.contours()`), producing the isobands.
4. Render over a US states basemap (`d3.geoAlbersUsa`, a states TopoJSON from `us-atlas`).

### 4.2 Visual language — "TV weather forecast for demand"
- **Diverging colour ramp**, centered on zero (normal demand): cool blue (demand dipping below normal) → neutral cream at zero → hot red (demand surging above normal). This mirrors the universal hot/cold weather-map convention AND encodes action in both directions (pull money out of blue, push into red). Tune in OKLCH for perceptual evenness; avoid garish saturation. Provide a colourblind-safe toggle (blue→orange) as a setting, but default to blue/red for instant legibility.
- **Isolines** drawn thin over the fill, with a few large, friendly labels (e.g. "+20%", "NORMAL", "−15%"). No dense technical gridlines.
- **The "front":** the leading edge where demand crosses from normal into surge. Emphasize it (thicker contour or subtle glow) — this is the "demand front" the whole metaphor rests on.
- **Animated day scrubber** (1–7): playing it forward shows the front sweeping across the country. This animation is the single most persuasive thing in the demo — make it smooth (transition the contour fills).
- **Action markers:** only on metros flagged by the diagnosis layer (§5) — a small pulsing dot where a demand surge meets an under-weighted media market. Tapping a marker opens the diagnosis + action drawer.

### 4.3 Restraint
No axes, no legends-with-paragraphs, no chart junk. A title ("Where demand is heading — [Category] — Day +3, Thursday"), the map, the scrubber, the headline alert. Everything else is one tap deep.

---

## 5. Diagnosis layer (intelligence out)

Input: the demand_delta field + `data/media_plan.json` (the brand's current spend weighting per metro).

For each metro × category × day:
```
opportunity_score = demand_delta × (target_weight − current_weight) × metro_value
```
- `current_weight`: share of the flight's budget currently in this metro (from media_plan).
- `target_weight`: what weight the demand signal implies (normalize demand_delta across metros).
- `metro_value`: a size factor (population or notional category $ per metro) so big gaps in big markets rank above tiny ones.

**Rank** all (metro, category) pairs by `opportunity_score`. The top item is the headline alert. Each alert carries its evidence: the forecast that drives it, the elasticity + r² behind the projection, the current vs implied media weight, and the dollar size of the gap.

Two gap types, both actionable:
- **Under-indexed surge** (high demand, low weight) → move money IN.
- **Over-indexed slump** (demand dropping, money still parked) → move money OUT.

The cleanest reallocation pairs the two: pull from a cooling over-weighted metro, push to a heating under-weighted one. Show that as an explicit "from → to" budget move.

---

## 6. The portfolio (dazzle: two categories, opposite weather response)

The fictional client is a national CPG brand running two product lines with **opposite** weather elasticities. As a heat front sweeps east, one line's isobars flush red along the front while the other goes blue behind it — and Bellwether reallocates between them live. This contrast is the dazzle; build for it.

`data/categories.json`:
- **`cold_refreshment`** — positive temp elasticity. Proxy candidates (pick best r² in calibration): `Ice_cream`, `Iced_coffee`, `Lemonade`, `Sunscreen`, `Air_conditioning`.
- **`warm_comfort`** — negative temp elasticity. Proxy candidates: `Soup`, `Hot_chocolate`, `Tea`, `Slow_cooker`.

(Optional third for extra texture if time allows: a humidity/pollen line, proxy `Allergic_rhinitis`, driver `relative_humidity` or a pollen variable. **Do not build this until the two-category loop is fully working.**)

A category-switcher (two big tabs) flips the active isobar field. The reallocation story is most vivid when you switch between them on the same day and watch the map invert.

---

## 7. Action layer (action taken)

### 7.1 The brief (always works — template-driven, no LLM dependency)
Generate a strategist-grade brief from the top alert by filling a rich structured template with the real computed numbers. Sections: **Situation** (what the forecast shows, where), **Why it matters** (demand projection + the evidence/r²), **Recommendation** (the specific from→to dollar move), **Creative angle** (weather-appropriate messaging cue for the category), **Timing window** (the forecast days affected), **Owner** (the named regional buyer from media_plan). It must read like a person wrote it, populated entirely from real values. Render in the action drawer; offer "copy" and "download .md".

> **Optional LLM upgrade (only if time + a proxy exist):** route the brief through a tiny Cloudflare Worker that calls an LLM, so the prose is generated rather than templated. Mark clearly as optional. The template version must remain the default so the demo cannot break. Do **not** put any API key in client code.

### 7.2 The Slack push (the real "it acts" moment)
The headline action fires a real message to a Slack channel via an **incoming webhook**.
- **Reliable path:** a minimal **Cloudflare Worker** (free, ~15 lines) that accepts the message JSON from the browser and forwards it to the Slack webhook. This sidesteps Slack's webhook CORS restriction. Worker URL stored in a config constant.
- **Zero-infra fallback:** a `mailto:` link pre-filled with the drafted alert to the buyer. Works everywhere, no backend, still visibly "drafts the alert to the right person." Ship this as the default if no Worker is set up, and let a config flag switch to Slack.
- The Slack message contains: the headline ("⚠️ Heat front → Atlanta + Charlotte, Thu–Sat"), the demand projection, the dollar move, and a link back to the app view.

### 7.3 The loop, closed
Frame the whole thing as a **scheduled morning run**: a GitHub Action (`/.github/workflows/run.yml`) that, on a cron, regenerates the day's forecast snapshot and (optionally) posts the top alert to Slack — proving it runs unattended, "with no human in the middle." The live demo shows today's real run, then the user taps an alert to fire the action manually.

---

## 8. Repo structure

```
bellwether/
├── index.html              # single-page app shell
├── src/
│   ├── main.js             # orchestration: fetch forecast → field → render → diagnose
│   ├── forecast.js         # Open-Meteo forecast fetch (batched, CORS)
│   ├── model.js            # anomaly + elasticity → demand_delta
│   ├── interpolate.js      # IDW grid
│   ├── isobars.js          # d3-contour + albersUsa rendering + animation
│   ├── diagnose.js         # opportunity scoring + ranking
│   ├── action.js           # brief template + Slack/mailto
│   └── ui.js               # scrubber, category tabs, drawer (progressive disclosure)
├── data/
│   ├── metros.json         # ~40 US metros: name, lat, lon, population, media weights
│   ├── media_plan.json     # current spend weights + named buyer per metro
│   ├── categories.json     # portfolio definitions
│   ├── coefficients.json   # WRITTEN BY calibrate.py — elasticity, r2, scatter
│   └── normals.json        # WRITTEN BY calibrate.py — climatological normals
├── scripts/
│   └── calibrate.py        # build-time: Wikipedia + ERA5 → coefficients.json, normals.json
├── worker/
│   └── slack-proxy.js       # optional Cloudflare Worker for Slack
├── .github/workflows/run.yml
└── README.md
```

Libraries (CDN, browser): `d3-geo`, `d3-contour`, `d3-scale`, `d3-selection`, `d3-transition`, `topojson-client`, `us-atlas` states TopoJSON. Calibration: Python with `requests`, `pandas`, `numpy`, `scikit-learn` (or numpy polyfit).

### Config seed data
- `metros.json`: ~40 top US metros with good national spread (so the isobar field has coverage edge-to-edge). Seed examples — **expand to ~40**: New York (40.71,-74.01), Los Angeles (34.05,-118.24), Chicago (41.88,-87.63), Houston (29.76,-95.37), Phoenix (33.45,-112.07), Atlanta (33.75,-84.39), Seattle (47.61,-122.33), Denver (39.74,-104.99), Miami (25.76,-80.19), Minneapolis (44.98,-93.27), Boston (42.36,-71.06), Dallas (32.78,-96.80). Cover all regions incl. Mountain West and Pacific NW.
- `media_plan.json`: assign each metro a plausible `current_weight` (sums to 1.0) deliberately **mis-aligned** with summer weather (e.g., over-weight cool coastal metros, under-weight hot interior ones) so the demo surfaces real gaps. Give each metro a fictional `buyer_name`.

---

## 9. Build order (demo-critical path first — protect the wow)

Build in this order so a working, impressive demo exists as early as possible:

1. **Static map + live forecast + isobars with PLACEHOLDER elasticities.** This is the showstopper; it must exist no matter what else slips. Hardcode `elasticity` and trivial normals to start. Get the animated front sweeping across the US.
2. **Category tabs + the day scrubber animation.** The two-line invert moment.
3. **Diagnosis layer + headline alert + action markers.**
4. **Action drawer: template brief + mailto Slack-fallback.**
5. **`calibrate.py`** → replace placeholder elasticities with real `coefficients.json` + `normals.json`. Wire the r²/scatter evidence panel.
6. **Cloudflare Worker Slack push** (upgrade from mailto).
7. **GitHub Action scheduled run.**
8. *(only if time)* third category; LLM brief upgrade.

If the clock runs out, stopping after step 5 still yields a complete, calibrated, end-to-end loop.

---

## 10. The 60-second demo narrative (build toward this)

> "Every brand says it's data-driven, but they all watch *yesterday's* numbers. This watches the forecast. [Map, front sweeping east.] A heat front hits the Southeast Thursday. For our client's cold-refreshment line, demand is about to jump 20% above normal across Atlanta and Charlotte — and we know that because we calibrated it on five years of real demand data [tap → r² scatter]. But look at the media plan: those markets are under-weighted. [Tap alert.] So Bellwether moves $40k out of cooling Seattle into heating Atlanta, writes the brief, and — [tap] — pings the regional buyer in Slack. The weather doesn't arrive for three days. We've already acted."

Every feature must serve this story. If a feature doesn't show up in the 60 seconds, question whether to build it.

---

## 11. Guardrails

- **Brand-safe** output only (required by the brief). Keep generated copy professional.
- **No keys in the browser.** Ever.
- **Deterministic demo:** given the same forecast, the same alert ranks first. No randomness in scoring.
- **Attribution:** "Weather data by Open-Meteo.com" + "Demand proxy: Wikimedia Pageviews" in footer.
- **Graceful failure:** if the live forecast call fails on stage, fall back to a cached `data/forecast_snapshot.json` from the morning's run so the demo never shows a blank map. Cache it via the GitHub Action.
- **Keep the surface childlike.** Resist every urge to add panels to the front screen.
