// action.js — turn the top alert into a strategist-grade brief and a real push
// (Slack via a tiny Worker, or a prefilled mailto: fallback that works anywhere).
import { CONFIG, DOW_LONG } from "./config.js?v=3";

const usd = (n) =>
  "$" + Math.round(n).toLocaleString("en-US");
const cToF = (c) => Math.round((c * 9) / 5 + 32);
const pct = (x, d = 0) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}%`;

// Rarity word for an anomaly's z-score (surprise).
function rarity(z) {
  const s = Math.abs(z || 0);
  if (s >= 2.5) return "Rare";
  if (s >= 1.5) return "Unusual";
  if (s >= 0.9) return "Notable";
  return "Mild";
}

// Build the headline string (used in alert chip + Slack title).
export function headlineText(diag, category) {
  const h = diag.headline;
  // Lead with how UNUSUAL the swing is for THIS market — that's the hook, not
  // the raw temperature. Name the direction by the weather anomaly so it reads
  // correctly for both positive- and negative-elasticity lines.
  const dir = h.anomaly >= 0 ? "heat" : "cold";
  const sig = (h.surprise || 0).toFixed(1);
  return `${rarity(h.surprise)} ${dir} swing → ${h.name} · ${sig}σ vs normal (${category.label})`;
}

// Strategist brief as Markdown. Template-driven — always works, no LLM needed.
export function buildBrief(diag, category, forecastSource) {
  const h = diag.headline;
  const s = diag.source;
  const day = DOW_LONG[new Date(diag.date + "T00:00:00Z").getUTCDay()];
  const moveLine = s
    ? `Move **${usd(diag.reallocation)}** from **${s.name}** (demand ${pct(s.value)}, over-indexed) → **${h.name}** (demand ${pct(h.value)}, under-indexed).`
    : `Shift **${usd(diag.reallocation)}** into **${h.name}** to match projected demand.`;

  return `# Bellwether Alert — ${category.label}
**${headlineText(diag, category)}**  ·  ${diag.date} (${day})

## Situation
The forecast puts **${h.name}, ${h.state}** at **${cToF(h.tmax)}°F** on ${day}, a **${h.anomaly >= 0 ? "+" : ""}${h.anomaly.toFixed(1)}°C departure** from its seasonal normal (${cToF(h.normal)}°F). For ${h.name} that is a **${(h.surprise || 0).toFixed(1)}σ** move — ${rarity(h.surprise).toLowerCase()} for a market that normally swings only ±${(h.sigma || 0).toFixed(1)}°C day to day. ${s ? `Meanwhile **${s.name}** is sitting at a routine ${Math.abs(s.surprise || 0).toFixed(1)}σ (${Math.abs(s.anomaly).toFixed(1)}°C from normal) yet carries more media weight than its demand warrants.` : ""}

## Why it matters
This is **not the obvious call**. ${h.name} isn't the hottest market on the map — it's the one where the *change* is largest relative to its own norms, so the lift is the least priced-into the plan. For the **${category.label}** line, projected demand there is **${pct(h.value, 0)} vs normal** — calibrated on multi-year historical demand data (elasticity **${category.elasticity} %/°C**, **r² ${category.r2}**). ${category.tagline}

The media plan is mis-aligned with this signal:
- ${h.name}: demand implies **${(h.target_weight * 100).toFixed(1)}%** of the flight, currently funded at **${(h.current_weight * 100).toFixed(1)}%** — a **${usd(h.dollars)}** gap.
${s ? `- ${s.name}: demand implies **${(s.target_weight * 100).toFixed(1)}%**, currently **${(s.current_weight * 100).toFixed(1)}%** — **${usd(-s.dollars)}** over-funded.` : ""}

## Recommendation
${moveLine}

## Creative angle
${(category.creative_angle || "").replace("{temp_f}", cToF(h.tmax))}

## Timing window
Act now — the front lands **${day}** and the forecast lead time is the advantage. Brief creative + reallocate before spend locks.

## Owner
**${h.buyer}** ${h.handle ? `(${h.handle})` : ""} — regional buyer, ${h.name}.

---
*Demand projection is a model on a pageviews demand proxy, not sales; elasticity is a national average applied to the local anomaly. Weather data by Open-Meteo.com. Forecast: ${forecastSource}.*
`;
}

// The compact payload sent to Slack / shown in the draft.
export function slackMessage(diag, category) {
  const h = diag.headline;
  const s = diag.source;
  const move = s
    ? `Move ${usd(diag.reallocation)}: ${s.name} → ${h.name}`
    : `Shift ${usd(diag.reallocation)} into ${h.name}`;
  return (
    `⚠️ *${headlineText(diag, category)}*\n` +
    `Projected demand *${pct(h.value)}* vs normal in ${h.name} (${cToF(h.tmax)}°F, ${h.anomaly >= 0 ? "+" : ""}${h.anomaly.toFixed(1)}°C anomaly).\n` +
    `*${move}*\n` +
    `Owner: ${h.buyer} ${h.handle}\n` +
    `<${CONFIG.appUrl}|Open in Bellwether →>`
  );
}

// Fire the action. Returns { ok, mode, detail }.
export async function fireAction(diag, category) {
  const text = slackMessage(diag, category);
  if (CONFIG.slackWorkerUrl) {
    try {
      const res = await fetch(CONFIG.slackWorkerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, mode: "slack", detail: "Posted to Slack." };
    } catch (e) {
      console.warn("Slack push failed, falling back to mailto:", e.message);
    }
  }
  // Zero-infra fallback: prefilled email draft to the named buyer.
  const h = diag.headline;
  const to =
    (h.handle ? h.handle.replace("@", "") : "buyer") +
    "@" +
    CONFIG.fallbackEmailDomain;
  const subject = encodeURIComponent(`[Bellwether] ${headlineText(diag, category)}`);
  const body = encodeURIComponent(text.replace(/[*<>|]/g, ""));
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  return { ok: true, mode: "mailto", detail: `Drafted email to ${h.buyer}.` };
}

export { usd, cToF, pct, rarity };
