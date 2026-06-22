// ui.js — progressive-disclosure widgets: evidence scatter, reallocation table,
// drawer, and a tiny markdown renderer for the brief.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { usd, pct } from "./action.js";

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

  // axes (zero lines)
  svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 8).attr("y2", H - pad)
    .attr("stroke", "#cbd2dc");
  svg.append("line").attr("x1", pad).attr("x2", W - 8).attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", "#cbd2dc");

  svg.selectAll("circle").data(pts).join("circle")
    .attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1])).attr("r", 2.6)
    .attr("fill", category.accent || "#e4572e").attr("opacity", 0.5);

  // fit line through origin-ish using stored elasticity
  const e = category.elasticity;
  svg.append("line")
    .attr("x1", x(-xmax)).attr("y1", y(-xmax * e))
    .attr("x2", x(xmax)).attr("y2", y(xmax * e))
    .attr("stroke", "#1a2030").attr("stroke-width", 2);

  svg.append("text").attr("x", W - 10).attr("y", H - 8).attr("text-anchor", "end")
    .attr("font-size", 11).attr("fill", "#5a6473").text("temp anomaly (°C) →");
  svg.append("text").attr("x", 10).attr("y", 16).attr("font-size", 11)
    .attr("fill", "#5a6473").text("demand residual (%)");
  svg.append("text").attr("x", pad + 4).attr("y", 22)
    .attr("font-size", 15).attr("font-weight", 700).attr("fill", "#1a2030")
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
      <thead><tr><th>Metro</th><th>Demand</th><th>Now</th><th>Implied</th><th>Move</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export { usd, pct };
