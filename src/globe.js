// globe.js — the entry surface. A spun-up orthographic globe; aim it anywhere on
// Earth, then "lock in" a region. Riso poster styling: paper sphere, blue
// graticule, ink city dots, orange reticle + selection.
import { d3 } from "../vendor/libs.js?v=3";
import { CONFIG, PALETTE } from "./config.js?v=3";

const TAU = 2 * Math.PI;

export class Globe {
  constructor(svgEl, cities, { onAim } = {}) {
    this.svg = d3.select(svgEl);
    this.el = svgEl;
    this.cities = cities;
    this.onAim = onAim || (() => {});
    this.rotate = [-30, -20, 0]; // start aimed at the Atlantic-ish / N hemisphere
    this.autoTimer = null;
    this.idleResume = null;
  }

  size() {
    const r = this.el.getBoundingClientRect();
    this.W = Math.max(320, r.width || 600);
    this.H = Math.max(320, r.height || 600);
  }

  init() {
    this.size();
    this.svg.attr("viewBox", `0 0 ${this.W} ${this.H}`).attr("preserveAspectRatio", "xMidYMid meet");
    this.svg.selectAll("*").remove();

    this.projection = d3.geoOrthographic()
      .rotate(this.rotate)
      .clipAngle(90);
    const margin = 14;
    this.projection
      .scale(Math.min(this.W, this.H) / 2 - margin)
      .translate([this.W / 2, this.H / 2]);
    this.path = d3.geoPath(this.projection);
    this.graticule = d3.geoGraticule().step([20, 20]);

    // ocean / sphere
    this.gSphere = this.svg.append("g");
    this.sphere = this.gSphere.append("path")
      .datum({ type: "Sphere" })
      .attr("fill", PALETTE.paper2)
      .attr("stroke", PALETTE.ink)
      .attr("stroke-width", 2);
    this.gratPath = this.gSphere.append("path")
      .datum(this.graticule())
      .attr("fill", "none")
      .attr("stroke", PALETTE.blue)
      .attr("stroke-width", 0.6)
      .attr("stroke-opacity", 0.4);

    this.gReticle = this.svg.append("g");
    this.gDots = this.svg.append("g");

    this.attachDrag();
    this.render();
    this.startAuto();
    window.addEventListener("resize", this._onResize = () => this.onResize());
    return this;
  }

  onResize() {
    this.size();
    this.svg.attr("viewBox", `0 0 ${this.W} ${this.H}`);
    this.projection.scale(Math.min(this.W, this.H) / 2 - 14).translate([this.W / 2, this.H / 2]);
    this.render();
  }

  attachDrag() {
    const sens = 0.28; // deg per px
    const drag = d3.drag()
      .on("start", () => { this.stopAuto(); clearTimeout(this.idleResume); })
      .on("drag", (ev) => {
        const r = this.projection.rotate();
        let lon = r[0] + ev.dx * sens;
        let lat = r[1] - ev.dy * sens;
        lat = Math.max(-89, Math.min(89, lat));
        this.rotate = [lon, lat, r[2]];
        this.projection.rotate(this.rotate);
        this.render();
      })
      .on("end", () => {
        this.idleResume = setTimeout(() => this.startAuto(), 3500);
      });
    this.svg.call(drag).style("cursor", "grab");
  }

  startAuto() {
    this.stopAuto();
    let last = Date.now();
    this.autoTimer = d3.timer(() => {
      const now = Date.now();
      const r = this.projection.rotate();
      this.rotate = [r[0] + (now - last) * 0.004, r[1], r[2]]; // gentle eastward spin
      last = now;
      this.projection.rotate(this.rotate);
      this.render();
    });
  }
  stopAuto() { if (this.autoTimer) { this.autoTimer.stop(); this.autoTimer = null; } }

  center() {
    const r = this.projection.rotate();
    return [-r[0], -r[1]];
  }

  // Cities within lockRadiusDeg of centre, clamped to [min,max], nearest first.
  selection() {
    const c = this.center();
    const cRad = [c[0] * Math.PI / 180, c[1] * Math.PI / 180];
    const withDist = this.cities.map((m) => ({
      m,
      d: d3.geoDistance([m.lon, m.lat], c) * 180 / Math.PI,
    })).sort((a, b) => a.d - b.d);
    let sel = withDist.filter((x) => x.d <= CONFIG.lockRadiusDeg);
    if (sel.length < CONFIG.minRegionCities) sel = withDist.slice(0, CONFIG.minRegionCities);
    if (sel.length > CONFIG.maxRegionCities) sel = sel.slice(0, CONFIG.maxRegionCities);
    void cRad;
    return sel.map((x) => x.m);
  }

  // Name the locked region from the modal region label of the selection.
  regionLabel(sel) {
    const counts = {};
    sel.forEach((m) => { counts[m.region] = (counts[m.region] || 0) + 1; });
    let best = "", n = -1;
    for (const k in counts) if (counts[k] > n) { n = counts[k]; best = k; }
    return best || "Region";
  }

  render() {
    const c = this.center();
    this.sphere.attr("d", this.path);
    this.gratPath.attr("d", this.path);

    // reticle: the lock circle at centre
    const circle = d3.geoCircle().center(c).radius(CONFIG.lockRadiusDeg)();
    this.gReticle.selectAll("path").data([circle]).join("path")
      .attr("d", this.path)
      .attr("fill", PALETTE.orange)
      .attr("fill-opacity", 0.12)
      .attr("stroke", PALETTE.orange)
      .attr("stroke-width", 1.6)
      .attr("stroke-dasharray", "5 4");

    const selList = this.selection();
    const sel = new Set(selList.map((m) => m.id));
    // only draw the near hemisphere
    const visible = this.cities.filter((m) => d3.geoDistance([m.lon, m.lat], c) < Math.PI / 2);
    const dots = this.gDots.selectAll("circle").data(visible, (m) => m.id);
    dots.join(
      (enter) => enter.append("circle"),
      (update) => update,
      (exit) => exit.remove()
    )
      .attr("cx", (m) => this.projection([m.lon, m.lat])[0])
      .attr("cy", (m) => this.projection([m.lon, m.lat])[1])
      .attr("r", (m) => (sel.has(m.id) ? 3.6 : 1.8))
      .attr("fill", (m) => (sel.has(m.id) ? PALETTE.orange : PALETTE.ink))
      .attr("fill-opacity", (m) => (sel.has(m.id) ? 1 : 0.5))
      .attr("stroke", (m) => (sel.has(m.id) ? PALETTE.paper : "none"))
      .attr("stroke-width", 1);

    // only notify when the locked selection actually changes (avoids per-frame churn)
    const key = selList.map((m) => m.id).join("|");
    if (key !== this._lastSelKey) { this._lastSelKey = key; this.onAim(selList); }
  }

  destroy() {
    this.stopAuto();
    clearTimeout(this.idleResume);
    if (this._onResize) window.removeEventListener("resize", this._onResize);
  }
}
