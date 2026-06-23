// diagnose.js — intelligence layer. Where projected demand is high but the
// brand's media weight is low (the gap that loses money), and vice versa.
//
//   target_weight : implied weight from the demand signal (market size x surge)
//   move          : target_weight - current_weight  (share points to shift)
//   dollars       : move * flightBudget
//
// Deterministic: same field -> same ranking. No randomness.
import { CONFIG, DOW } from "./config.js?v=3";

const relu = (x) => (x > 0 ? x : 0);

// field: array of city points (from model.demandField) for the headline day.
// mediaPlan: { id: { current_weight, buyer_name, buyer_handle } }
export function diagnose(field, mediaPlan, dayIndex, dates) {
  // Renormalise the brand's current weights WITHIN this locked region so the
  // flight budget is treated as 100% of the region's spend, whatever subset of
  // cities the globe locked onto.
  let cwSum = 0;
  field.forEach((p) => { cwSum += (mediaPlan[p.id] && mediaPlan[p.id].current_weight) || 0; });
  const curWeight = (id) => {
    const w = (mediaPlan[id] && mediaPlan[id].current_weight) || 0;
    return cwSum > 1e-9 ? w / cwSum : 1 / field.length;
  };
  // metro value: dampened population share (so big gaps in big markets rank up,
  // without NYC swamping everything).
  const valRaw = {};
  let valSum = 0;
  field.forEach((p) => {
    const v = Math.pow(p.population, 0.65);
    valRaw[p.id] = v;
    valSum += v;
  });
  const value = (id) => valRaw[id] / valSum;

  // implied (target) weight: market value x demand surge, normalised.
  let rawSum = 0;
  const raw = {};
  field.forEach((p) => {
    raw[p.id] = value(p.id) * relu(p.value);
    rawSum += raw[p.id];
  });
  const allFlat = rawSum < 1e-9;

  const rows = field.map((p) => {
    const cw = curWeight(p.id);
    const tw = allFlat ? value(p.id) : raw[p.id] / rawSum;
    const move = tw - cw; // + => add budget, - => cut budget
    const dollars = move * CONFIG.flightBudget;
    let kind;
    if (p.value > 1 && move > 0) kind = "surge_underweight"; // push IN
    else if (move < 0) kind = "slump_overweight"; // pull OUT
    else kind = "aligned";
    return {
      ...p,
      buyer: (mediaPlan[p.id] || {}).buyer_name || "Unassigned",
      handle: (mediaPlan[p.id] || {}).buyer_handle || "",
      current_weight: cw,
      target_weight: tw,
      move,
      dollars,
      kind,
      score: Math.abs(dollars) * (0.5 + value(p.id)),
    };
  });

  const ranked = [...rows].sort((a, b) => b.score - a.score);
  const pushIn = rows
    .filter((r) => r.kind === "surge_underweight")
    .sort((a, b) => b.dollars - a.dollars);
  const pullOut = rows
    .filter((r) => r.kind === "slump_overweight")
    .sort((a, b) => a.dollars - b.dollars);

  const headline = pushIn[0] || ranked[0];
  const source = pullOut[0] || null;
  // The clean reallocation: move min(|headline gap|, |source surplus|) from->to.
  const moveDollars = source
    ? Math.min(headline.dollars, -source.dollars)
    : headline.dollars;

  return {
    dayIndex,
    date: dates[dayIndex],
    dow: DOW[new Date((dates[dayIndex] || "") + "T00:00:00Z").getUTCDay()],
    rows,
    ranked,
    pushIn,
    pullOut,
    headline,
    source,
    reallocation: Math.max(0, Math.round(moveDollars)),
  };
}

// Pick the most actionable day across the week (largest headline opportunity).
export function pickHeadlineDay(weekDiagnoses) {
  let best = weekDiagnoses[0];
  for (const d of weekDiagnoses) {
    if (d.headline && (!best.headline || d.headline.score > best.headline.score)) best = d;
  }
  return best;
}
