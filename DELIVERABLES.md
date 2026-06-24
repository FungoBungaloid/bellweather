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
**Say:** "This is a weather map where the fronts aren't temperature, they're *demand*. Red is where demand for a product is about to surge above normal; blue is where it's about to fall below. It reads on sight — and it's live, pulled from a real forecast across 117 cities worldwide."

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
**Say:** "And it acts. Bellwether writes the specific reallocation — pull this much out of the cooling market, push it into the heating one — drafts a strategist-grade brief with the real numbers, and fires it to the named buyer in Slack. One tap. The brief is template-driven so the demo never depends on a model being up."

### Slide 7 — The loop runs itself (Originality + Action)
**On screen:** A clock/cron icon → GitHub Action → forecast snapshot → Slack. Caption: *"A scheduled morning run, no human in the middle."*
**Say:** "Weather-triggered ads already exist — but only as reactive creative swaps at the ad server, *when the weather hits*. Nobody operates upstream, at the planning layer, with forecast lead time. Bellwether fills that empty seat — and it runs unattended on a cron, so the alert is waiting in Slack before anyone's at their desk."

### Slide 8 — Close
**On screen:** The tagline again — *"We act three days before the weather arrives."* — plus the live app URL and team name.
**Say:** "Childlike on the surface — a weather map a kid could read. Rigorous one tap down — calibrated elasticities, ranked dollar gaps, a real action fired. That's the distance between insight and action, closed. Thank you."

**If you only have 5 slides:** keep 1, 2, 3, 6, 7 (gap → product → signal → action → the self-running loop). That still hits all five rubric axes.

---

## 03 — Video Demo Script (~75 seconds, narrated)

> Rule from the brief: *show it working, don't describe it.* Every line below is spoken **over a live screen recording** of the app. Capture on the most dramatic forecast day available so the front is vivid.

**[0:00 — Globe]** *Screen: the spinning globe.*
> "This is Bellwether. It watches the weather forecast across the world — because the forecast tells you where demand is heading before any sales number does."

**[0:08 — Lock a region]** *Aim and lock onto a region with a strong front (e.g. Europe in a heatwave).*
> "I'll lock onto Europe. Bellwether pulls the live forecast for every market here and turns it into a demand map."

**[0:16 — The map]** *The isobar map fills in.*
> "Red is where demand is about to surge above normal; blue is where it's falling below. Right now there's a sharp cold swing over Lisbon."

**[0:24 — Scrub the days]** *Hit play on the day scrubber; the front sweeps.*
> "Play it forward and you watch the front move across the days — this is demand, three to seven days out."

**[0:32 — Switch product, the invert]** *Switch from a cold-weather product to a hot-weather one.*
> "Switch the product line and the map inverts — what's a surge for hot-weather demand is a slump for cold-weather demand, on the very same day. Same forecast, opposite money."

**[0:42 — The evidence tap]** *Open the r² scatter.*
> "And this isn't a hunch. We calibrated each product's weather sensitivity on years of real demand data — here's the fit, r-squared shown right on screen."

**[0:52 — The gap + alert]** *Tap the headline alert / action marker.*
> "Now cross-reference the media plan. Demand is jumping here, but the brand is under-weighted — that's the gap. Bellwether sizes it in dollars and ranks it."

**[1:02 — The action]** *Open the drawer: brief + from→to move; tap to fire.*
> "It writes the move — pull budget from the cooling market, push it into the heating one — drafts the brief, and pings the buyer in Slack. One tap."

**[1:12 — Close]** *Cut back to the map / Slack confirmation.*
> "The weather doesn't arrive for three days. We've already acted. That's Bellwether."

**Recording tips**
- Record at the app's native size; the Riso palette compresses well. Keep the cursor movements slow and deliberate.
- Pre-pick the region + day with the strongest front so the sweep and the invert both land.
- If live forecast is flaky on the day, the GitHub Action's cached `forecast_snapshot.json` keeps the map populated — record against that as a safety net.
- Capture the Slack message actually arriving (or the prefilled email draft) — the brief says *show it working*.

---

## Pre-submission checklist
- [ ] Fill team name / country on the cover slide and slide 8.
- [ ] Re-run `scripts/calibrate.py` in an environment with outbound network (or via the `build-data` GitHub Action) so the on-screen elasticities/r² are freshly calibrated. *(See note below.)*
- [ ] Screenshot the cover-slide key image from the live app on a dramatic forecast day.
- [ ] Record the demo; confirm the Slack/email action fires on camera.
- [ ] Footer attribution present in app + deck: "Weather data by Open-Meteo.com · Demand proxy: Wikimedia Pageviews."

> **Calibration note:** the committed `data/coefficients.json` was produced before the de-trending fix and shows every product with a negative elasticity at r²≈0 — an artifact, not signal. The fix is in `scripts/calibrate.py`; it must be re-run where the ERA5 + Wikimedia APIs are reachable before the signal-quality slide/scatter will hold up. Don't present the scatter until that's regenerated.
