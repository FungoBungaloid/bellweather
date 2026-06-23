// isobars.js — the showpiece. A demand-pressure map for the locked region.
// d3-contour over an IDW grid, drawn on a geoMercator projection fit to whatever
// region the globe locked onto. Riso poster styling: blue→paper→orange isobands
// that overprint a warm-paper basemap.
import { d3, topojson } from "../vendor/libs.js?v=3";
import { CONFIG, PALETTE } from "./config.js?v=3";
import { idwGrid } from "./interpolate.js?v=3";

const FRACS = [0.13, 0.22, 0.34, 0.5, 0.72, 1.0]; // band edges as fraction of scale max

function scaleThresholds(M) {
  const neg = FRACS.map((f) => -M * f).reverse();
  const pos = FRACS.map((f) => M * f);
  return { thresholds: [...neg, ...pos], front: M * FRACS[0] };
}

// Riso diverging ramp: blue (demand below normal) → paper (normal) → orange (surge).
const RAMP_DEFAULT = d3.interpolateRgbBasis([
  "#16237a", "#2436d4", "#6f86e8", "#c7d2f2", "#efe7d4", "#f6c39a", "#ff8a4d", "#ff5a1f", "#bf3a0a",
]);
// Colourblind-safe navy → orange (no mid-greens).
const RAMP_CB = d3.interpolateRgbBasis([
  "#0a2f6b", "#3b6fd1", "#9ec1e8", "#e9e7da", "#f7c79a", "#f59042", "#c75a13",
]);

export class IsobarMap {
  constructor(svgEl) {
    this.svg = d3.select(svgEl);
    this.W = CONFIG.mapWidth;
    this.H = CONFIG.mapHeight;
    this.colorblind = false;
    this.setScale(15);
  }

  setScale(maxAbs) {
    this.colorMax = Math.max(4, maxAbs);
    const { thresholds, front } = scaleThresholds(this.colorMax);
    this.thresholds = thresholds;
    this.frontThreshold = front;
    if (this._lastField) this.render(this._lastField);
  }

  ramp() { return this.colorblind ? RAMP_CB : RAMP_DEFAULT; }
  color(v) {
    const M = this.colorMax;
    const t = (Math.max(-M, Math.min(M, v)) + M) / (2 * M);
    return this.ramp()(t);
  }

  async init() {
    this.svg
      .attr("viewBox", `0 0 ${this.W} ${this.H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    this.defs = this.svg.append("defs");

    // layers, bottom → top. The demand field is the *background*; outlines and
    // the graticule are drawn ON TOP of it so they're always legible (otherwise
    // the 0.9-opacity fills bury them and you see no map at all).
    this.gFill = this.svg.append("g").attr("class", "fills");
    this.gLines = this.svg.append("g").attr("class", "lines");
    this.gFront = this.svg.append("g").attr("class", "front");
    this.gGrat = this.svg.append("g").attr("class", "grat");
    this.gBase = this.svg.append("g").attr("class", "base");
    this.gCities = this.svg.append("g").attr("class", "cities");
    this.gMarkers = this.svg.append("g").attr("class", "markers");

    // hover tooltip (city detail + live isoband readout)
    this.tip = d3.select(this.svg.node().parentNode).append("div")
      .attr("class", "maptip").style("display", "none");
    this.svg
      .on("mousemove.tip", (ev) => { if (!this._overCity) this.showBandTip(ev); })
      .on("mouseleave.tip", () => { if (!this._overCity) this.hideTip(); });

    // Load US state borders once; drawn (finer detail) when a region touches US.
    const EXCLUDE = new Set(["02", "15", "72", "60", "66", "69", "78"]);
    try {
      const us = await fetch(CONFIG.statesTopoUrl).then((r) => r.json());
      const so = us.objects.states;
      const conus = {
        type: "GeometryCollection",
        geometries: so.geometries.filter((g) => !EXCLUDE.has(String(g.id))),
      };
      this.usBorders = topojson.mesh(us, conus, (a, b) => a !== b);
    } catch (e) {
      console.warn("US basemap unavailable.", e.message);
      this.usBorders = null;
    }

    // Optional world outlines (coastlines + national borders) for ANY region.
    // Ships only after CI/`npm run vendor` fetches it; absent → graticule only.
    this.worldMesh = null;
    try {
      const w = await fetch("./data/countries-110m.json");
      if (w.ok) {
        const topo = await w.json();
        const key = topo.objects.countries ? "countries" : Object.keys(topo.objects)[0];
        this.worldMesh = topojson.mesh(topo, topo.objects[key]);
      }
    } catch (e) { /* graticule-only fallback */ }

    this.graticule = d3.geoGraticule().step([10, 10]);

    // grid->pixel transform for contour geometry
    const sx = this.W / CONFIG.gridX;
    const sy = this.H / CONFIG.gridY;
    this.contourPath = d3.geoPath(
      d3.geoTransform({ point(x, y) { this.stream.point(x * sx, y * sy); } })
    );
  }

  // Fit the projection to the locked region's cities and (re)build basemap+clip.
  setRegion(cities) {
    this.region = cities;
    const fc = { type: "MultiPoint", coordinates: cities.map((m) => [m.lon, m.lat]) };
    const pad = 0.16 * Math.min(this.W, this.H);
    this.projection = d3.geoMercator()
      .fitExtent([[pad, pad], [this.W - pad, this.H - pad]], fc);
    // clamp absurd zoom when cities are nearly coincident
    if (this.projection.scale() > 4000) this.projection.scale(4000);
    this.geoPath = d3.geoPath(this.projection);

    // graticule (drawn over the field, so always visible)
    this.gGrat.selectAll("path").data([this.graticule()]).join("path")
      .attr("d", this.geoPath)
      .attr("fill", "none")
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.4)
      .attr("stroke-opacity", 0.16)
      .attr("vector-effect", "non-scaling-stroke");

    // basemap outlines — on TOP of the demand field. World coastlines/borders
    // for any region (if vendored), plus finer US state lines when relevant.
    this.gBase.selectAll("path").remove();
    if (this.worldMesh) {
      this.gBase.append("path")
        .attr("d", this.geoPath(this.worldMesh))
        .attr("fill", "none")
        .attr("stroke", PALETTE.ink)
        .attr("stroke-width", 1.1)
        .attr("stroke-opacity", 0.7)
        .attr("vector-effect", "non-scaling-stroke");
    }
    const touchesUS = cities.some((m) => m.cc === "US");
    if (touchesUS && this.usBorders) {
      this.gBase.append("path")
        .attr("d", this.geoPath(this.usBorders))
        .attr("fill", "none")
        .attr("stroke", PALETTE.ink)
        .attr("stroke-width", 0.7)
        .attr("stroke-opacity", this.worldMesh ? 0.4 : 0.55)
        .attr("vector-effect", "non-scaling-stroke");
    }

    // Full-bleed demand field — the IDW grid covers the whole stage, so the
    // pressure map reads edge to edge like a poster. (No region clip: a tight
    // bounding box risked a degenerate rect that blanked the whole map.)
  }

  project(lon, lat) { return this.projection([lon, lat]); }

  // ---- hover tooltips ----
  sampleGrid(vx, vy) {
    if (!this._grid) return null;
    const cw = this.W / CONFIG.gridX, ch = this.H / CONFIG.gridY;
    let i = Math.floor(vx / cw), j = Math.floor(vy / ch);
    i = Math.max(0, Math.min(CONFIG.gridX - 1, i));
    j = Math.max(0, Math.min(CONFIG.gridY - 1, j));
    return this._grid[j * CONFIG.gridX + i];
  }
  placeTip(ev) {
    const [px, py] = d3.pointer(ev, this.svg.node().parentNode);
    const flip = px > this.svg.node().parentNode.clientWidth - 240;
    this.tip.style("display", "block")
      .style("left", (flip ? px - 230 : px + 16) + "px")
      .style("top", (py + 16) + "px");
  }
  showBandTip(ev) {
    const [vx, vy] = d3.pointer(ev, this.svg.node());
    const v = this.sampleGrid(vx, vy);
    if (v == null || isNaN(v)) { this.hideTip(); return; }
    const s = v >= 0 ? "pos" : "neg";
    this.tip.html(`<div class="t-band"><b class="${s}">${v >= 0 ? "+" : ""}${v.toFixed(0)}%</b> demand vs normal</div>`);
    this.placeTip(ev);
  }
  showCityTip(ev, d) {
    const f = (c) => Math.round((c * 9) / 5 + 32);
    const s = d.value >= 0 ? "pos" : "neg";
    this.tip.html(
      `<div class="t-city">${d.name}<span class="t-mut">, ${d.state}</span></div>` +
      `<div class="t-row"><span>Demand vs normal</span><b class="${s}">${d.value >= 0 ? "+" : ""}${d.value.toFixed(1)}%</b></div>` +
      `<div class="t-row"><span>Surprise</span><b>${(d.surprise || 0).toFixed(1)}σ</b></div>` +
      `<div class="t-row"><span>Forecast</span><b>${f(d.tmax)}°F</b></div>` +
      `<div class="t-mut t-small">${d.anomaly >= 0 ? "+" : ""}${d.anomaly.toFixed(1)}°C vs seasonal normal · market σ ${(d.sigma || 0).toFixed(1)}°C</div>`
    );
    this.placeTip(ev);
  }
  hideTip() { if (this.tip) this.tip.style("display", "none"); }

  // field: [{lon,lat,value,name,state,...}]. Builds grid + contours and draws them.
  render(field) {
    const pts = field
      .map((p) => {
        const xy = this.project(p.lon, p.lat);
        return xy ? { x: xy[0], y: xy[1], value: p.value } : null;
      })
      .filter(Boolean);

    const grid = idwGrid(pts, this.W, this.H, CONFIG.gridX, CONFIG.gridY, CONFIG.idwPower);
    const contours = d3.contours()
      .size([CONFIG.gridX, CONFIG.gridY])
      .thresholds(this.thresholds)(grid);

    this.gFill.selectAll("path").data(contours, (d) => d.value).join("path")
      .attr("d", (d) => this.contourPath(d))
      .attr("fill", (d) => this.color(d.value))
      .attr("fill-opacity", 0.92);

    this.gLines.selectAll("path")
      .data(contours.filter((d) => d.value !== this.frontThreshold), (d) => d.value).join("path")
      .attr("d", (d) => this.contourPath(d))
      .attr("fill", "none")
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 0.5)
      .attr("stroke-opacity", 0.38)
      .attr("vector-effect", "non-scaling-stroke");

    this._grid = grid; // kept for hover sampling

    // the demand FRONT — emphasised in ink
    const front = contours.find((d) => d.value === this.frontThreshold);
    this.gFront.selectAll("path").data(front ? [front] : []).join("path")
      .attr("d", (d) => this.contourPath(d))
      .attr("fill", "none")
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 2.4)
      .attr("stroke-opacity", 0.9)
      .attr("vector-effect", "non-scaling-stroke");

    // context: every region city as a small ink dot + label
    this.renderCities(field);
    this._lastField = field;
  }

  renderCities(field) {
    const data = field.map((p) => {
      const xy = this.project(p.lon, p.lat);
      return xy ? { ...p, x: xy[0], y: xy[1] } : null;
    }).filter(Boolean);

    const g = this.gCities.selectAll("g.city").data(data, (d) => d.id).join(
      (enter) => {
        const e = enter.append("g").attr("class", "city");
        e.append("circle").attr("class", "cdot");
        e.append("text").attr("class", "clabel");
        return e;
      },
      (update) => update,
      (exit) => exit.remove()
    ).attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .on("mouseenter", (ev, d) => { this._overCity = true; this.showCityTip(ev, d); })
      .on("mousemove", (ev, d) => this.showCityTip(ev, d))
      .on("mouseleave", () => { this._overCity = false; this.hideTip(); });

    g.select("circle.cdot").attr("r", 3).attr("fill", PALETTE.ink).attr("fill-opacity", 0.9);
    g.select("text.clabel")
      .attr("x", 5).attr("y", 3).attr("font-size", 9.5)
      .attr("font-family", "'Space Mono', ui-monospace, monospace").attr("letter-spacing", "0.02em")
      .attr("fill", PALETTE.ink).attr("paint-order", "stroke")
      .attr("stroke", PALETTE.paper).attr("stroke-width", 2.4)
      .text((d) => d.name);
  }

  // Action markers: only on flagged cities. onClick(row).
  setMarkers(rows, onClick) {
    const data = rows.map((r) => {
      const xy = this.project(r.lon, r.lat);
      return xy ? { ...r, x: xy[0], y: xy[1] } : null;
    }).filter(Boolean);

    const g = this.gMarkers.selectAll("g.marker").data(data, (d) => d.id).join(
      (enter) => {
        const e = enter.append("g").attr("class", "marker").style("cursor", "pointer");
        e.append("circle").attr("class", "ring");
        e.append("circle").attr("class", "core");
        return e;
      },
      (update) => update,
      (exit) => exit.remove()
    )
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("click", (ev, d) => onClick && onClick(d))
      .on("mouseenter", (ev, d) => { this._overCity = true; this.showCityTip(ev, d); })
      .on("mousemove", (ev, d) => this.showCityTip(ev, d))
      .on("mouseleave", () => { this._overCity = false; this.hideTip(); });

    g.select("circle.ring")
      .attr("r", 8).attr("fill", "none")
      .attr("stroke", (d) => (d.value >= 0 ? PALETTE.orange : PALETTE.blue))
      .attr("stroke-width", 2);
    g.select("circle.core")
      .attr("r", 4)
      .attr("fill", (d) => (d.value >= 0 ? PALETTE.orange : PALETTE.blue))
      .attr("stroke", PALETTE.paper).attr("stroke-width", 1.5);
  }

  setColorblind(on) {
    this.colorblind = on;
    if (this._lastField) this.render(this._lastField);
  }
}
