// ui.js — progressive-disclosure widgets: evidence scatter, reallocation table,
// drawer, and a tiny markdown renderer for the brief.
import { d3 } from "../vendor/libs.js?v=3";
import { usd, pct } from "./action.js?v=3";

// --- tiny, safe-enough markdown (headings, bold, italics, lists, hr) ---
export function md(src) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = src.split("\n");
  let html = "";
  let inList = false;
  for (let raw of lines) {
    let line = esc(raw);
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    line = line.replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>");
    if (/^### /.test(line)) { html += `<h4>${line.slice(4)}</h4>`; continue; }
    if (/^## /.test(line)) { html += `<h3>${line.slice(3)}</h3>`; continue; }
    if (/^# /.test(line)) { html += `<h2>${line.slice(2)}</h2>`; continue; }
    if (/^---\s*$/.test(line)) { html += "<hr/>"; continue; }
    if (/^- /.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.slice(2)}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    if (line.trim() === "") html += "";
    else html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

// Evidence scatter: anomaly (x) vs demand residual (y) + OLS fit + r² badge.
export function renderScatter(svgEl, category) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  const W = 360, H = 240, pad = 34;
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  const pts = category.scatter || [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const xmax = Math.max(8, ...xs.map(Math.abs));
  const ymax = Math.max(10, ...ys.map(Math.abs));
  const x = d3.scaleLinear().domain([-xmax, xmax]).range([pad, W - 8]);
  const y = d3.scaleLinear().domain([-ymax, ymax]).range([H - pad, 8]);

  const INK = "#1a1714", MUTED = "#6b6354", MONO = "'Space Mono', ui-monospace, monospace";
  // axes (zero lines)
  svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 8).attr("y2", H - pad)
    .attr("stroke", INK).attr("stroke-opacity", 0.3);
  svg.append("line").attr("x1", pad).attr("x2", W - 8).attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", INK).attr("stroke-opacity", 0.3);

  svg.selectAll("circle").data(pts).join("circle")
    .attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1])).attr("r", 2.6)
    .attr("fill", category.accent || "#ff5a1f").attr("opacity", 0.6);

  // fit line through origin-ish using stored elasticity
  const e = category.elasticity;
  svg.append("line")
    .attr("x1", x(-xmax)).attr("y1", y(-xmax * e))
    .attr("x2", x(xmax)).attr("y2", y(xmax * e))
    .attr("stroke", INK).attr("stroke-width", 2.5);

  svg.append("text").attr("x", W - 10).attr("y", H - 8).attr("text-anchor", "end")
    .attr("font-size", 10).attr("font-family", MONO).attr("fill", MUTED).text("temp anomaly (°C) →");
  svg.append("text").attr("x", 10).attr("y", 16).attr("font-size", 10)
    .attr("font-family", MONO).attr("fill", MUTED).text("demand residual (%)");
  svg.append("text").attr("x", pad + 4).attr("y", 22)
    .attr("font-size", 14).attr("font-weight", 700).attr("font-family", MONO).attr("fill", INK)
    .text(`r² = ${category.r2}   ·   ${category.elasticity} %/°C`);
}

// Reallocation table HTML (top opportunities, from->to highlighted).
export function reallocTable(diag) {
  const top = diag.ranked.slice(0, 6);
  const rows = top
    .map((r) => {
      const tag =
        r.kind === "surge_underweight"
          ? `<span class="pill in">PUSH IN</span>`
          : r.kind === "slump_overweight"
          ? `<span class="pill out">PULL OUT</span>`
          : `<span class="pill flat">HOLD</span>`;
      const dlr = r.dollars >= 0 ? `+${usd(r.dollars)}` : `−${usd(-r.dollars)}`;
      return `<tr>
        <td>${r.name}, ${r.state}</td>
        <td class="num">${pct(r.value)}</td>
        <td class="num">${(r.current_weight * 100).toFixed(1)}%</td>
        <td class="num">${(r.target_weight * 100).toFixed(1)}%</td>
        <td class="num ${r.dollars >= 0 ? "pos" : "neg"}">${dlr}</td>
        <td>${tag}</td>
      </tr>`;
    })
    .join("");
  const src = diag.source;
  const h = diag.headline;
  const move = src
    ? `<div class="move">Reallocate <b>${usd(diag.reallocation)}</b>: <span class="neg">${src.name}</span> → <span class="pos">${h.name}</span></div>`
    : `<div class="move">Shift <b>${usd(diag.reallocation)}</b> into <span class="pos">${h.name}</span></div>`;
  return `${move}
    <table class="realloc">
      <thead><tr><th>Market</th><th>Demand</th><th>Now</th><th>Implied</th><th>Move</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// --- broadcast ticker (chyron) ---------------------------------------------
// One scrolling line of key reallocations across cities.
export function tickerHTML(diag, catLabel) {
  const items = diag.rows
    .filter((r) => Math.abs(r.dollars) >= 15000)
    .sort((a, b) => Math.abs(b.dollars) - Math.abs(a.dollars))
    .slice(0, 18);
  const parts = items.map((r) => {
    const up = r.dollars >= 0;
    const arrow = up ? "▲" : "▼";
    const cls = up ? "up" : "dn";
    const amt = (up ? "+" : "−") + "$" + Math.abs(Math.round(r.dollars / 1000)) + "K";
    return `<span class="tk ${cls}"><span class="arr">${arrow}</span> <b>${r.name.toUpperCase()}</b> ${pct(r.value)} · ${amt}</span>`;
  });
  const lead = `<span class="tk lead">${catLabel.toUpperCase()} · DEMAND vs PLAN</span>`;
  // duplicate for a seamless marquee loop
  const seq = [lead, ...parts].join(`<span class="tk sep">◆</span>`);
  return seq + `<span class="tk sep">◆</span>` + seq + `<span class="tk sep">◆</span>`;
}

// --- right-rail card (auto-cycling detail) ----------------------------------
export function railCardHTML(r, catMeta) {
  const up = r.value >= 0;
  const kindLabel =
    r.kind === "surge_underweight" ? "UNDER-INDEXED SURGE"
    : r.kind === "slump_overweight" ? "OVER-INDEXED SLUMP"
    : "ON PLAN";
  const moveTxt = r.dollars >= 0 ? `+${usd(r.dollars)} IN` : `−${usd(-r.dollars)} OUT`;
  const cw = (r.current_weight * 100);
  const tw = (r.target_weight * 100);
  const wmax = Math.max(cw, tw, 1);
  return `
    <div class="rc-kind ${r.kind}">${kindLabel}</div>
    <div class="rc-city">${r.name}<span class="rc-st">, ${r.state}</span></div>
    <div class="rc-demand ${up ? "warm" : "cool"}">
      <span class="rc-big">${pct(r.value)}</span>
      <span class="rc-sub">projected demand<br/>vs normal · ${Math.round((r.tmax*9)/5+32)}°F</span>
    </div>
    <div class="rc-bars">
      <div class="rc-barrow"><span>NOW</span><div class="rc-bar"><i style="width:${(cw/wmax*100).toFixed(0)}%"></i></div><b>${cw.toFixed(1)}%</b></div>
      <div class="rc-barrow imp"><span>IMPLIED</span><div class="rc-bar"><i style="width:${(tw/wmax*100).toFixed(0)}%"></i></div><b>${tw.toFixed(1)}%</b></div>
    </div>
    <div class="rc-move ${r.dollars >= 0 ? "pos" : "neg"}">${moveTxt}</div>
    <div class="rc-owner">Owner · ${r.buyer} ${r.handle || ""}</div>`;
}

export { usd, pct };
