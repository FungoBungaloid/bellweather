# Bellwether — Hackathon Deliverables

> AI & Tech Sandbox Global Hackathon 2026 — *"Intelligence to Action"*
> This file packages the three required submissions: **(01) Cover slide**, **(02) Presentation deck (5–10 slides)**, **(03) Video demo script**.
>
> Fill the `[bracketed]` fields before submitting — they're the only things not yet decided.

---

## 01 — Cover Slide

A single slide. Keep it spare: one key image, five lines of text.

| Field | Value |
|---|---|
| **Team name** | `[TEAM NAME]` |
| **Country** | `[COUNTRY]` |
| **Project title** | **Bellwether** |
| **Description (20 words)** | *Bellwether turns the weather forecast into a demand map, finds where ad budget isn't following demand, and acts days early.* |
| **Key image** | The isobar map mid-animation — a heat front sweeping across a region with one pulsing action marker on the under-weighted metro. (Screenshot the live app on the most dramatic forecast day; crop to the map + headline alert.) |

**Tagline under the title (optional, high-impact):**
> *Existing weather-marketing tools react when the weather arrives. Bellwether acts three days before it does.*

**Design notes:** Riso-poster aesthetic already in the app — warm paper background (`#f4ecd8`), ink text, the blue→cream→orange diverging ramp. Use the app's own type (Space Mono for labels) so the slide and the product look like one thing.

---

## 02 — Presentation Deck (8 slides)

Sized to the rubric's five axes — **Problem Framing, Signal Quality, Intelligence Depth, Action Quality, Originality** — with one slide each plus open/architecture/close. Every slide lists *what's on it* and *what you say*.

### Slide 1 — The gap (Problem Framing)
**On screen:** Big line: *"The distance between insight and action is where advantage is lost."* Below it, two columns: **Everyone watches** → *yesterday's sales (a lagging, internal number)*. **We watch** → *the forecast (a leading, external signal)*.
**Say:** "Every brand calls itself data-driven, but they're all staring at yesterday's numbers. By the time the dashboard moves, the moment's gone. Bellwether watches the one signal that arrives *before* demand does — the weather forecast — and buys back the lead time."

### Slide 2 — What Bellwether is (the one-liner + the map)
**On screen:** The live isobar map, animated, mid-front. Caption: *"A weather map — but the fronts are demand."*
**Say:** "This is a weather map where the fronts aren't temperature, they're *demand*. Red is where demand for a product is about to surge above normal; blue is where it's about to fall below. It reads on sight — and it's live: one keyless, batched call to the Open-Meteo forecast API pulls 7 days across 117 cities, and every line on this map is computed in the browser. No backend, no API keys."

### Slide 3 — Signal quality: calibrated, not hand-waved
**On screen:** The r² scatter panel (anomaly vs. demand residual) for a category, with the elasticity and r² called out. Footer: *"Weather data: Open-Meteo · Demand proxy: Wikimedia Pageviews."*
**Say:** "We don't guess the link between weather and demand — we measure it. At build time we regress years of real demand-proxy data against historical temperature anomalies, per category, and we show the r² on screen. Where the fit is weak, we say so. The number on the map is earned."
**Honesty line (keep it — judges reward it):** "Pageviews are a demand *proxy*, not sales, and the elasticity is a national average applied to each local anomaly. We're upfront about both."

### Slide 4 — Intelligence depth: demand departure, not weather
**On screen:** The anomaly formula, then the demand formula:
`anomaly = forecast − local seasonal normal` → `demand_delta = elasticity × anomaly`.
A small inset: a 28°C day flagged as a spike in one city and a non-event in another.
**Say:** "The insight isn't 'it's hot.' A hot day in one city is a Tuesday in another. We compute demand as a *departure from each market's own normal*, measured against that market's typical swings — so we surface the non-obvious markets where the money actually is."

### Slide 5 — From signal to gap (Intelligence → diagnosis)
**On screen:** Side-by-side: the demand field vs. the brand's current media plan. The opportunity-score formula: `demand_delta × (target_weight − current_weight) × metro_value`. The ranked gap list / ticker.
**Say:** "Then we cross-reference the demand forecast against the brand's *actual* media plan. Where demand is surging but spend is light — that's money on the floor. We rank every market by the size of that gap and surface the biggest one as the headline."

### Slide 6 — Action quality: it acts
**On screen:** The action drawer — the from→to dollar move, the templated strategist brief, and the Slack/▶ buttons. Show a real Slack message or the prefilled email draft.
**Say:** "And it acts. Bellwether writes the specific reallocation — pull this much out of the cooling market, push it into the heating one — drafts a strategist-grade brief with the real numbers, and fires it to the named buyer in Slack through a tiny Cloudflare Worker, with an email draft as a zero-infra fallback. One tap. The brief is template-driven so the demo never depends on a model being up; routing it through an LLM is an optional upgrade on the same Worker."

### Slide 7 — The loop runs itself (Originality + Action)
**On screen:** A clock/cron icon → GitHub Action → forecast snapshot → Slack. A small two-lane diagram: **Build time (CI):** ERA5 + Wikipedia → regression → `coefficients.json`. **Runtime (browser):** live Open-Meteo forecast → anomaly × elasticity → map → alert → Slack. Caption: *"A scheduled morning run, no human in the middle."*
**Say:** "Weather-triggered ads already exist — but only as reactive creative swaps at the ad server, *when the weather hits*. Nobody operates upstream, at the planning layer, with forecast lead time. Bellwether fills that empty seat. The heavy lifting — calibrating elasticities on ERA5 history and Wikipedia demand proxies — happens offline in CI; the browser only ever makes one live forecast call and does light math. So it runs unattended on a cron, and the alert is waiting in Slack before anyone's at their desk."

### Slide 8 — Close
**On screen:** The tagline again — *"We act three days before the weather arrives."* — plus the live app URL and team name.
**Say:** "Childlike on the surface — a weather map a kid could read. Rigorous one tap down — calibrated elasticities, ranked dollar gaps, a real action fired. That's the distance between insight and action, closed. Thank you."

**If you only have 5 slides:** keep 1, 2, 3, 6, 7 (gap → product → signal → action → the self-running loop). That still hits all five rubric axes.

---

## 03 — Video Demo Script (~110 seconds, narrated)

> Rule from the brief: *show it working, don't describe it.* Every line below is spoken **over a live screen recording** of the app. Capture on the most dramatic forecast day available so the front is vivid. The script now folds in the technical "how" — data sources, what's AI vs. statistics, and how a real brand's data plugs in — at the moments each becomes visible on screen.

**[0:00 — Globe]** *Screen: the spinning globe.*
> "This is Bellwether — a single static web page, no backend, no API keys, deployable to GitHub Pages. It watches the weather forecast worldwide, because the forecast tells you where demand is heading before any sales number does."

**[0:10 — Lock a region]** *Aim and lock onto a region with a strong front (e.g. Europe in a heatwave).*
> "I'll lock onto Europe. The moment I do, the browser hits the Open-Meteo forecast API — keyless, CORS-open — and pulls a 7-day forecast for all 117 cities in a single batched request. That's the only live call the app makes, and it's real data, right now."

**[0:22 — The map]** *The isobar map fills in.*
> "Then it does the math locally. For each city we take the forecast, subtract that market's own climatological normal for the day — so this is a *departure from normal*, not raw temperature — multiply by the product's calibrated weather elasticity, and interpolate the points into a field with inverse-distance weighting. D3 contours that into isobands. Red is demand surging above normal, blue is demand dipping below. There's a sharp cold swing over Lisbon."

**[0:40 — Scrub the days]** *Hit play on the day scrubber; the front sweeps.*
> "Play it forward and the front moves across the days — demand, three to seven days out, computed entirely in the browser."

**[0:48 — Switch product, the invert]** *Switch from a cold-weather product to a hot-weather one.*
> "Switch the product line and the map inverts — a surge for hot-weather demand is a slump for cold-weather demand on the very same day. That sign comes straight from each product's elasticity coefficient. Same forecast, opposite money."

**[0:58 — The evidence tap / under the hood]** *Open the r² scatter.*
> "And this isn't a hunch. Those elasticities are calibrated *offline*, in a Python step — `calibrate.py` — that pulls years of historical temperature from the ERA5 reanalysis archive and a demand proxy from Wikipedia pageviews, then runs a linear regression per category. It writes out the elasticity and the r² you see here. That calibration is the machine-learning core; it runs at build time in a GitHub Action, never in the browser, so there's no key to leak and nothing heavy to load."

**[1:14 — The gap + alert]** *Tap the headline alert / action marker.*
> "Now cross-reference the brand's media plan. We score every market — demand departure, times the gap between current and implied spend weight, times market size — and rank them. Demand's jumping here but the brand is under-weighted: that's the gap, sized in dollars."

**[1:26 — The action]** *Open the drawer: brief + from→to move; tap to fire.*
> "It writes the reallocation — pull budget from the cooling market, push it into the heating one — drafts a strategist brief from the real numbers, and pings the named buyer in Slack through a tiny Cloudflare Worker, with an email draft as the zero-infra fallback. The brief is templated by default so the demo can't break; an LLM upgrade through the same Worker is optional."

**[1:40 — Plugging in real data + close]** *Cut back to the map / Slack confirmation.*
> "Everything here runs on real or realistic data: the forecast is live, the elasticities are regressed on real history. To go to production you swap two files — the demand proxy becomes the brand's own point-of-sale data so the r² is theirs, and the sample media plan becomes their real flight. The forecast and the math don't change. The weather doesn't arrive for three days. We've already acted. That's Bellwether."

**Recording tips**
- Record at the app's native size; the Riso palette compresses well. Keep the cursor movements slow and deliberate.
- Pre-pick the region + day with the strongest front so the sweep and the invert both land.
- If live forecast is flaky on the day, the GitHub Action's cached `forecast_snapshot.json` keeps the map populated — record against that as a safety net.
- Capture the Slack message actually arriving (or the prefilled email draft) — the brief says *show it working*.
- The technical lines (especially [0:22] and [0:58]) are the densest — if you're tight on time, those are the ones to trim to a single sentence. Keep the data-source names (Open-Meteo, ERA5, Wikipedia pageviews) audible; they're what earns the signal-quality score.

---

## Architecture & data sources (presenter reference)

Keep this handy for Q&A; it's the precise version of what the script says.

| Concern | What it is | When it runs |
|---|---|---|
| **Live forecast** | Open-Meteo Forecast API — keyless, CORS-open, all 117 cities batched in one request (`daily=temperature_2m_max`, 7 days). | **Runtime**, in the browser |
| **Historical weather** | ERA5 reanalysis via Open-Meteo Archive API — used to build per-market climatological normals and the calibration's reference temperature series. | **Build time** (`calibrate.py`) |
| **Demand proxy** | Wikimedia Pageviews API for a per-category proxy article (e.g. *Ice cream*). Server-side because it requires a `User-Agent` header browsers can't set. | **Build time** (`calibrate.py`) |
| **Calibration (the ML)** | Per-category linear regression of de-seasonalised, de-trended demand residual on temperature anomaly → `elasticity` + `r²`, written to `data/coefficients.json`. | **Build time**, in a GitHub Action |
| **Demand model** | `anomaly = forecast − normal`; `demand_delta = elasticity × anomaly`; plus a z-score vs. each market's own σ ("surprise"). | Runtime (`model.js`) |
| **Map** | Inverse-distance-weighted grid → `d3-contour` isobands over a `d3-geoMercator` TopoJSON basemap. | Runtime (`interpolate.js`, `isobars.js`) |
| **Diagnosis** | `opportunity_score = demand_delta × (target_weight − current_weight) × metro_value`, ranked. | Runtime (`diagnose.js`) |
| **Action** | Template-driven brief (deterministic) + Slack push via optional Cloudflare Worker, `mailto:` fallback. | Runtime (`action.js`, `worker/slack-proxy.js`) |
| **The loop** | GitHub Actions: `build-data.yml` regenerates coefficients/normals; `run.yml` cron-refreshes the forecast snapshot and can post the top alert to Slack — unattended. | Scheduled (CI) |

**What's AI / ML, stated honestly:** the intelligence is a *calibrated statistical model*, not a black box — supervised linear regression for the elasticities, anomaly detection against each market's own variance, IDW spatial interpolation, and a ranked scoring step for the gap. The only *generative* AI is the optional LLM brief upgrade routed through the Cloudflare Worker; the default brief is templated so the demo never depends on a model being reachable.

**Synthetic vs. real data in the PoC:** the *forecast* (live) and the *historical weather + demand-proxy calibration* are real. The *brand* is fictional — `media_plan.json` (spend weights + named buyers) and the 16 product lines in `categories.json` are illustrative. Going to production is a two-file swap: replace the Wikipedia demand proxy with the brand's point-of-sale / sell-through data (the regression is identical; the r² becomes theirs and can be computed per-market instead of national), and replace the sample media plan with their actual flight export. The forecast path and all the math are unchanged.

---

## Pre-submission checklist
- [ ] Fill team name / country on the cover slide and slide 8.
- [ ] Re-run `scripts/calibrate.py` in an environment with outbound network (or via the `build-data` GitHub Action) so the on-screen elasticities/r² are freshly calibrated. *(See note below.)*
- [ ] Screenshot the cover-slide key image from the live app on a dramatic forecast day.
- [ ] Record the demo; confirm the Slack/email action fires on camera.
- [ ] Footer attribution present in app + deck: "Weather data by Open-Meteo.com · Demand proxy: Wikimedia Pageviews."

> **Calibration note:** the committed `data/coefficients.json` was produced before the de-trending fix and shows every product with a negative elasticity at r²≈0 — an artifact, not signal. The fix is in `scripts/calibrate.py`; it must be re-run where the ERA5 + Wikimedia APIs are reachable before the signal-quality slide/scatter will hold up. Don't present the scatter until that's regenerated.
