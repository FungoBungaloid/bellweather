// isobars.js — the showpiece. A TV-weather map whose fronts are demand.
// d3-contour over an IDW grid, drawn on a geoAlbersUsa states basemap.
import { d3, topojson } from "../vendor/libs.js";
import { CONFIG } from "./config.js";
import { idwGrid } from "./interpolate.js";

const FRACS = [0.13, 0.22, 0.34, 0.5, 0.72, 1.0]; // band edges as fraction of scale max

// Symmetric thresholds + front edge derived from a data-driven scale max.
function scaleThresholds(M) {
  const neg = FRACS.map((f) => -M * f).reverse();
  const pos = FRACS.map((f) => M * f);
  return { thresholds: [...neg, ...pos], front: M * FRACS[0] };
}

// Diverging ramps: blue (demand below normal) -> cream (normal) -> red (surge).
const RAMP_DEFAULT = d3.interpolateRgbBasis([
  "#1f5fa6", "#5b9bd5", "#bcd6ec", "#f6f4e8", "#f3b9a0", "#e4572e", "#a01f1f",
]);
// Colourblind-safe blue -> orange.
const RAMP_CB = d3.interpolateRgbBasis([
  "#0571b0", "#74add1", "#cfe5f0", "#f6f4e8", "#fdd0a2", "#fb8d3a", "#b85000",
]);

export class IsobarMap {
  constructor(svgEl) {
    this.svg = d3.select(svgEl);
    this.W = CONFIG.mapWidth;
    this.H = CONFIG.mapHeight;
    this.colorblind = false;
    this.setScale(15); // sensible default until a category sets its own
  }

  // Tune the colour domain + contour bands to the data's actual range so the
  // map saturates instead of washing out near zero.
  setScale(maxAbs) {
    this.colorMax = Math.max(4, maxAbs);
    const { thresholds, front } = scaleThresholds(this.colorMax);
    this.thresholds = thresholds;
    this.frontThreshold = front;
    if (this._lastField) this.render(this._lastField);
  }

  ramp() {
    return this.colorblind ? RAMP_CB : RAMP_DEFAULT;
  }
  color(v) {
    const M = this.colorMax;
    const t = (Math.max(-M, Math.min(M, v)) + M) / (2 * M);
    return this.ramp()(t);
  }

  async init() {
    this.svg
      .attr("viewBox", `0 0 ${this.W} ${this.H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // defs: soft glow for the front
    const defs = this.svg.append("defs");
    const f = defs.append("filter").attr("id", "frontGlow")
      .attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    f.append("feGaussianBlur").attr("stdDeviation", 2.4).attr("result", "b");
    const m = f.append("feMerge");
    m.append("feMergeNode").attr("in", "b");
    m.append("feMergeNode").attr("in", "SourceGraphic");

    // layers (draw order)
    this.gFill = this.svg.append("g").attr("class", "fills");
    this.gLines = this.svg.append("g").attr("class", "lines");
    this.gFront = this.svg.append("g").attr("class", "front");
    this.gStates = this.svg.append("g").attr("class", "states");
    this.gLabels = this.svg.append("g").attr("class", "labels");
    this.gMarkers = this.svg.append("g").attr("class", "markers");

    // basemap — lower 48 ONLY. We use geoAlbers (not geoAlbersUsa) so there are
    // no Alaska/Hawaii insets for the Southwest metros to bleed into.
    const EXCLUDE = new Set(["02", "15", "72", "60", "66", "69", "78"]); // AK, HI, PR, territories
    let states = null;
    try {
      const us = await fetch(CONFIG.statesTopoUrl).then((r) => r.json());
      const so = us.objects.states;
      const conus = {
        type: "GeometryCollection",
        geometries: so.geometries.filter((g) => !EXCLUDE.has(String(g.id))),
      };
      states = topojson.feature(us, conus);
      this.borders = topojson.mesh(us, conus, (a, b) => a !== b);
      this.nation = topojson.merge(us, conus.geometries);
    } catch (e) {
      console.warn("Basemap load failed; contours only.", e.message);
    }

    this.projection = d3.geoAlbers(); // standard CONUS Albers
    if (states) this.projection.fitSize([this.W, this.H], states);
    else this.projection.scale(1280).translate([this.W / 2, this.H / 2]);
    this.geoPath = d3.geoPath(this.projection);

    if (states) {
      this.gStates
        .append("path")
        .attr("d", this.geoPath(this.borders))
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.30)")
        .attr("stroke-width", 0.7)
        .attr("vector-effect", "non-scaling-stroke");
      this.gStates
        .append("path")
        .attr("d", this.geoPath(this.nation))
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.55)")
        .attr("stroke-width", 1.4)
        .attr("vector-effect", "non-scaling-stroke");
      // clip the fills to the nation outline for a clean coast
      defs
        .append("clipPath")
        .attr("id", "usClip")
        .append("path")
        .attr("d", this.geoPath(this.nation));
      this.gFill.attr("clip-path", "url(#usClip)");
      this.gLines.attr("clip-path", "url(#usClip)");
      this.gFront.attr("clip-path", "url(#usClip)");
    }

    // grid->pixel transform for contour geometry
    const sx = this.W / CONFIG.gridX;
    const sy = this.H / CONFIG.gridY;
    this.contourPath = d3.geoPath(
      d3.geoTransform({
        point(x, y) {
          this.stream.point(x * sx, y * sy);
        },
      })
    );
  }

  project(lon, lat) {
    return this.projection([lon, lat]);
  }

  // field: [{lon,lat,value,...}]. Builds grid + contours and draws them.
  render(field) {
    const pts = field
      .map((p) => {
        const xy = this.project(p.lon, p.lat);
        return xy ? { x: xy[0], y: xy[1], value: p.value } : null;
      })
      .filter(Boolean);

    const grid = idwGrid(pts, this.W, this.H, CONFIG.gridX, CONFIG.gridY, CONFIG.idwPower);
    const contours = d3
      .contours()
      .size([CONFIG.gridX, CONFIG.gridY])
      .thresholds(this.thresholds)(grid);

    // filled bands
    this.gFill
      .selectAll("path")
      .data(contours, (d) => d.value)
      .join("path")
      .attr("d", (d) => this.contourPath(d))
      .attr("fill", (d) => this.color(d.value))
      .attr("fill-opacity", 0.82);

    // thin isolines
    this.gLines
      .selectAll("path")
      .data(contours.filter((d) => d.value !== this.frontThreshold), (d) => d.value)
      .join("path")
      .attr("d", (d) => this.contourPath(d))
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.45)")
      .attr("stroke-width", 0.6)
      .attr("vector-effect", "non-scaling-stroke");

    // the demand FRONT — emphasised
    const front = contours.find((d) => d.value === this.frontThreshold);
    this.gFront
      .selectAll("path")
      .data(front ? [front] : [])
      .join("path")
      .attr("d", (d) => this.contourPath(d))
      .attr("fill", "none")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", 0.9)
      .attr("filter", "url(#frontGlow)")
      .attr("vector-effect", "non-scaling-stroke");

    this._lastField = field;
  }

  // Action markers: pulsing dots only on flagged metros. onClick(row).
  setMarkers(rows, onClick) {
    const data = rows
      .map((r) => {
        const xy = this.project(r.lon, r.lat);
        return xy ? { ...r, x: xy[0], y: xy[1] } : null;
      })
      .filter(Boolean);

    const g = this.gMarkers
      .selectAll("g.marker")
      .data(data, (d) => d.id)
      .join(
        (enter) => {
          const e = enter.append("g").attr("class", "marker").style("cursor", "pointer");
          e.append("circle").attr("class", "pulse");
          e.append("circle").attr("class", "core");
          e.append("text").attr("class", "mlabel");
          return e;
        },
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("click", (ev, d) => onClick && onClick(d));

    g.select("circle.pulse")
      .attr("r", 6)
      .attr("fill", (d) => (d.value >= 0 ? "#e4572e" : "#2e86ab"))
      .attr("opacity", 0.5);
    g.select("circle.core")
      .attr("r", 4)
      .attr("fill", "#fff")
      .attr("stroke", (d) => (d.value >= 0 ? "#a01f1f" : "#1f5fa6"))
      .attr("stroke-width", 2);
    g.select("text.mlabel")
      .attr("x", 8)
      .attr("y", 4)
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#1a2030")
      .attr("paint-order", "stroke")
      .attr("stroke", "rgba(255,255,255,0.85)")
      .attr("stroke-width", 3)
      .text((d) => d.name);
  }

  setColorblind(on) {
    this.colorblind = on;
    if (this._lastField) this.render(this._lastField);
  }
}
