// Builds the presentation from docs/results/summary.json, so every number on a slide is the
// number the benchmark wrote. Images come from deck/assets.mjs (stamps) and deck/capture.sh
// (screenshots of the running site).
// Usage: node deck/assets.mjs && sh deck/capture.sh http://localhost:5191 && node deck/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxgen from "pptxgenjs";
import { TRUST } from "../web/src/data.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMG = path.join(ROOT, "deck", "img");
const OUT = path.join(ROOT, "deck", "LineOfTravel_DataNova2026.pptx");
const s = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "results", "summary.json"), "utf8"));
const demoRoutes = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "public", "data", "routes.json"), "utf8")).length;
const R = s.stats_raw, M = s.methods;

// ---------- the world: a letter carrier's case ----------
const INK = "1B2230", INK2 = "485060", INK3 = "6B7280", FACE = "F7F7F2", STOCK = "ECEEE7", RULE = "C9CEC3";
const STEEL = "56635A", STEEL_SOFT = "DFE3DA", GRAPHITE = "8B9098", CANCEL = "C4352B", CANCEL_INK = "A32A21", MANILA = "D9BD78";
const HEAD = "Arial Narrow", BODY = "Arial", MONO = "Courier New";
const W = 13.333, X0 = 0.6, CW = W - 2 * X0;

// ---------- formatting ----------
const n0 = (v) => Math.round(v).toLocaleString("en-US");
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3);
const drive = (saving) => `${saving >= 0 ? "−" : "+"}${f1(Math.abs(saving))}%`; // change in drive time
const pct0 = (v) => `${Math.round(v * 100)}%`;
const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
const lot = M.habit_30_300, zonesOnly = M.habit_0_600, tsp = M.tsp, drv = M.driver, nn = M.nearest;
const demo = s.links.demo || "link on the Devpost and Unstop pages";
const repo = s.links.repo && s.links.repo !== "https://github.com/" ? s.links.repo : "repository link on the Devpost page";

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// Fit an image inside a box, centred, keeping its aspect ratio.
function fit(file, x, y, w, h, align = "center") {
  const { w: iw, h: ih } = pngSize(file);
  const r = Math.min(w / iw, h / ih);
  const fw = iw * r, fh = ih * r;
  const fx = align === "left" ? x : x + (w - fw) / 2;
  return { path: file, x: fx, y: y + (h - fh) / 2, w: fw, h: fh };
}
const img = (name) => path.join(IMG, `${name}.png`);
const has = (name) => fs.existsSync(img(name));

// ---------- deck ----------
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "Line of Travel";
pres.subject = "DataNova 2026, DN-OR-01: driver-aware last-mile delivery route optimization";
pres.author = "Sanchay Singh";
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

const footer = (dark) => [
  { line: { x: X0, y: 7.0, w: CW, h: 0, line: { color: dark ? INK2 : RULE, width: 0.75 } } },
  { text: { text: "LINE OF TRAVEL · DATANOVA 2026 · DN-OR-01", options: { x: X0 + 0.32, y: 7.06, w: 7, h: 0.28, fontFace: MONO, fontSize: 9, color: dark ? GRAPHITE : INK3, charSpacing: 1, margin: 0 } } },
  ...(has("mark") ? [{ image: { path: img(dark ? "mark-face" : "mark"), x: X0, y: 7.06, w: 0.26, h: 0.26 } }] : []),
];
const kicker = (dark) => ({ placeholder: { options: { name: "kicker", type: "body", x: X0, y: 0.42, w: CW, h: 0.32, fontFace: MONO, fontSize: 11,
  color: dark ? MANILA : STEEL, charSpacing: 2, margin: 0, valign: "top", align: "left" }, text: "" } });
const titleBox = (o) => ({ placeholder: { options: { name: "title", type: "title", fontFace: HEAD, bold: true, margin: 0, valign: "top", align: "left", ...o }, text: "" } });
pres.defineSlideMaster({
  title: "CONTENT", background: { color: STOCK },
  objects: [...footer(false), kicker(false), titleBox({ x: X0, y: 0.74, w: CW, h: 0.95, fontSize: 34, color: INK })],
  slideNumber: { x: W - X0 - 0.6, y: 7.06, w: 0.6, h: 0.28, fontFace: MONO, fontSize: 9, color: INK3, align: "right" },
});
pres.defineSlideMaster({
  title: "DARK", background: { color: INK },
  objects: [...footer(true), kicker(true), titleBox({ x: X0, y: 1.0, w: 8.2, h: 1.6, fontSize: 88, color: FACE })],
});
pres.defineSlideMaster({
  title: "CLOSE", background: { color: INK },
  objects: [...footer(true), kicker(true), titleBox({ x: X0, y: 1.0, w: 7.6, h: 1.6, fontSize: 54, color: FACE })],
});

let section = "";
function slide(master, sec, kick, title, titleOpts = {}) {
  if (sec !== section) { pres.addSection({ title: sec }); section = sec; }
  const sl = pres.addSlide({ masterName: master, sectionTitle: sec });
  if (kick) sl.addText(kick, { placeholder: "kicker" });
  if (title) sl.addText(title, { placeholder: "title", ...titleOpts });
  return sl;
}
const text = (sl, t, o) => sl.addText(t, { isTextBox: true, margin: 0, fontFace: BODY, fontSize: 15, color: INK2, valign: "top", ...o });
const label = (sl, t, o) => text(sl, t, { fontFace: MONO, fontSize: 10, color: INK3, charSpacing: 1, ...o });

// A slot label from the carrier case: face card, steel hairline. The deck's repeated object.
function slot(sl, x, y, w, h, o = {}) {
  sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: o.fill || FACE }, line: { color: o.line || RULE, width: 0.75 }, objectName: o.name });
  if (o.accent) sl.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h, fill: { color: o.accent }, line: { color: o.accent, width: 0 } });
}
function stat(sl, x, y, w, h, value, cap, o = {}) {
  slot(sl, x, y, w, h, { accent: o.accent, name: o.name });
  label(sl, o.kick || "", { x: x + 0.25, y: y + 0.2, w: w - 0.4, h: 0.25 });
  text(sl, value, { x: x + 0.25, y: y + 0.45, w: w - 0.4, h: 0.85, fontFace: HEAD, fontSize: o.size || 44, bold: true, color: o.accent === CANCEL ? CANCEL_INK : INK });
  text(sl, cap, { x: x + 0.25, y: y + 1.3, w: w - 0.45, h: h - 1.4, fontSize: 12.5, color: INK2 });
}

// ---------- 1. title ----------
{
  const sl = slide("DARK", "Opening", "DATANOVA 2026 · DN-OR-01 · LAST-MILE DELIVERY ROUTE OPTIMIZATION", [
    { text: "Line of " }, { text: "Travel", options: { color: CANCEL } }]);
  text(sl, "Learns the order Amazon drivers actually deliver in, then removes only the detours.",
    { x: X0, y: 2.75, w: 7.6, h: 1.0, fontSize: 24, color: FACE });
  const items = [
    [drive(lot.saving), "drive time vs the driver's own order"],
    [f2(lot.reentries), `zone re-entries per route (shortest path: ${f1(tsp.reentries)})`],
    [n0(R.eval_routes), "real held-out routes in 5 US metros"],
  ];
  items.forEach(([v, c], i) => {
    const x = X0 + i * 2.75;
    text(sl, v, { x, y: 4.25, w: 2.6, h: 0.75, fontFace: HEAD, fontSize: 40, bold: true, color: i === 0 ? CANCEL : FACE });
    text(sl, c, { x, y: 5.0, w: 2.45, h: 0.7, fontSize: 12.5, color: GRAPHITE });
  });
  if (has("postmark")) sl.addImage({ ...fit(img("postmark"), 8.3, 1.0, 4.5, 2.6), altText: "Postmark stamp reading Line of Travel" });
  label(sl, `SANCHAY SINGH · SOLO ENTRY · LIVE DEMO: ${demo.toUpperCase()}`, { x: X0, y: 6.3, w: CW, h: 0.3, color: GRAPHITE });
  sl.addNotes(`Line of Travel is a route sequencer for last-mile delivery that keeps the order drivers already use. It learns that order from ${n0(R.train_routes)} real Amazon routes and then removes only the detours. On ${n0(R.eval_routes)} held-out routes it cuts drive time by ${f1(lot.saving)}% while almost never sending a van back into a zone it already finished.`);
}

// ---------- 2. the problem ----------
{
  const sl = slide("CONTENT", "Problem", "THE PROBLEM", `The shortest route is ${f1(tsp.saving)}% shorter. Drivers won't drive it.`);
  if (has("triptych")) sl.addImage({ ...fit(img("triptych"), X0, 1.75, CW, 4.25), altText: "The same route three ways: driver's order, shortest path, Line of Travel" });
  text(sl, [
    { text: "A pure optimizer ignores the zones drivers work in. ", options: { bold: true, color: INK } },
    { text: `On the held-out routes it re-enters ${f1(tsp.reentries)} zones per route, where drivers re-enter ${f1(drv.reentries)}. A plan the driver will not follow saves nothing, which is why Amazon's 2021 challenge scored routes on how closely they match what drivers really do.` },
  ], { x: X0, y: 6.15, w: CW, h: 0.7, fontSize: 14 });
  sl.addNotes(`Here is one real Boston route, three ways. Left is what the driver did. Middle is the shortest path through Amazon's own travel-time matrix: it is shorter, but it zig-zags back into zones the van already finished. Drivers don't drive that. Right is Line of Travel: it keeps the zones in the driver's order and still cuts the drive.`);
}

// ---------- 3. insight ----------
{
  const sl = slide("CONTENT", "Problem", "WHAT DRIVERS ACTUALLY DO", "Drivers work zone by zone, in an order they repeat.");
  const c = R.contiguity;
  stat(sl, X0, 1.85, 3.6, 1.55, pct0(c.single_visit), `of zones the driver finishes in one visit (about ${Math.round(c.zones_per_route)} zones per route)`, { kick: "ZONES KEPT WHOLE", size: 40 });
  stat(sl, X0, 3.55, 3.6, 1.55, pct0(R.zone_top1), `of the driver's next zones our model predicts, from about ${Math.round(s.zone.candidates)} choices`, { kick: "NEXT ZONE PREDICTED", accent: CANCEL, size: 40 });
  stat(sl, X0, 5.25, 3.6, 1.55, pct0(R.zone_nearest), "if you simply pick the nearest zone", { kick: "NEAREST-ZONE GUESS", size: 40 });
  if (has("case")) sl.addImage({ ...fit(img("case"), 4.55, 1.85, 8.18, 3.9), altText: "Carrier case: one slot per zone of the route, in the driver's order" });
  text(sl, [
    { text: "Where the name comes from. ", options: { bold: true, color: INK } },
    { text: "Mail carriers sort each day's mail into a case of pigeonholes in the order they walk. The US Postal Service records that order for every carrier route and calls it the Line of Travel. Amazon drivers have one too. Nobody wrote it down, so we learned it." },
  ], { x: 4.55, y: 5.9, w: 8.18, h: 0.95, fontSize: 13 });
  sl.addNotes(`Amazon splits each route into planning zones. Drivers finish ${pct0(c.single_visit)} of zones in one visit and move between zones in an order that repeats from day to day. That order is predictable: our model gets the next zone right ${pct0(R.zone_top1)} of the time, against ${pct0(R.zone_nearest)} for the nearest zone. The case on the right is the route from the previous slide, one slot per zone.`);
}

// ---------- 4. data and pipeline ----------
{
  const sl = slide("CONTENT", "Approach", "DATA AND PIPELINE", "Built only on Amazon's own routes, start to finish.");
  const boxes = [
    ["DATA", "Amazon Last Mile Routing Research Challenge 2021", `${n0(R.train_routes + R.eval_routes)} routes, ${n0(R.total_stops)} stops, 17 stations in 5 metros. Public S3, CC BY-NC 4.0.`],
    ["INGEST", "Parquet tables and float32 travel matrices", "Stops, zones, packages, delivery windows, service times, the driver's actual order."],
    ["LEARN", "Next-zone ranker (LightGBM)", `Trained on the ${n0(R.train_routes)} training routes. Gives every zone-to-zone move a habit cost.`],
    ["SOLVE", "Driver-aware sequencing engine", "Plain JavaScript. The same file runs the benchmark in Node and the demo in your browser."],
    ["SCORE", "Held-out benchmark", `${n0(R.eval_routes)} evaluation routes, Amazon's official route score, bootstrap intervals.`],
  ];
  const bw = 2.25, gap = (CW - 5 * bw) / 4;
  boxes.forEach(([k, h, b], i) => {
    const x = X0 + i * (bw + gap), y = 2.0;
    slot(sl, x, y, bw, 3.1, { accent: i === 2 || i === 3 ? CANCEL : STEEL });
    label(sl, `0${i + 1} · ${k}`, { x: x + 0.22, y: y + 0.2, w: bw - 0.3, h: 0.25, color: i === 2 || i === 3 ? CANCEL_INK : STEEL });
    text(sl, h, { x: x + 0.22, y: y + 0.5, w: bw - 0.35, h: 0.9, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
    text(sl, b, { x: x + 0.22, y: y + 1.45, w: bw - 0.35, h: 1.55, fontSize: 12, color: INK2 });
    if (i < 4) sl.addShape(pres.shapes.LINE, { x: x + bw + 0.04, y: y + 1.55, w: gap - 0.08, h: 0, line: { color: STEEL, width: 1.25, endArrowType: "triangle" } });
  });
  const windowShare = R.windowed_stops / (433231 - R.eval_routes);
  const facts = [
    [`${n0(R.train_routes)} / ${n0(R.eval_routes)}`, "training / held-out routes, split by Amazon"],
    [`${(windowShare * 100).toFixed(1)}%`, "of held-out stops carry a delivery time window"],
    ["n × n", "travel seconds per route, Amazon's road-network estimates"],
    ["0", "personal data used: no driver IDs, no customer names"],
  ];
  facts.forEach(([v, c], i) => {
    const x = X0 + i * (CW / 4);
    text(sl, v, { x, y: 5.45, w: CW / 4 - 0.2, h: 0.5, fontFace: HEAD, fontSize: 26, bold: true, color: INK });
    text(sl, c, { x, y: 5.95, w: CW / 4 - 0.3, h: 0.7, fontSize: 12, color: INK2 });
  });
  sl.addNotes("The whole system runs on Amazon's public Last Mile dataset. The pipeline downloads it in parallel, writes compact tables and travel matrices, trains the next-zone ranker on the training routes only, and benchmarks on the evaluation routes Amazon held back. The engine is one JavaScript file, so the numbers in this deck and the demo come from the same code.");
}

// ---------- 5. method ----------
{
  const sl = slide("CONTENT", "Approach", "METHOD", "Price every move the way a driver would. Then search.");
  slot(sl, X0, 1.8, CW, 1.25, { accent: CANCEL });
  label(sl, "EDGE COST USED BY THE SEARCH", { x: X0 + 0.3, y: 1.95, w: 6, h: 0.25, color: CANCEL_INK });
  text(sl, "cost(i → j) = travel(i, j) + [j in a new zone] × (crossing + w × −log p(zone j | zone i))",
    { x: X0 + 0.3, y: 2.3, w: CW - 0.5, h: 0.55, fontFace: MONO, fontSize: 15.5, color: INK, bold: true });
  const terms = [
    ["travel(i, j)", "Seconds on the road, straight from Amazon's travel-time matrix for that route."],
    ["crossing", "A flat charge for leaving a zone, so the van finishes a zone before it moves on."],
    ["−log p", "The habit cost: cheap for moves drivers usually make, expensive for moves they rarely make."],
  ];
  terms.forEach(([k, v], i) => {
    const y = 3.35 + i * 0.85;
    text(sl, k, { x: X0, y, w: 1.9, h: 0.7, fontFace: MONO, fontSize: 13, bold: true, color: INK });
    text(sl, v, { x: X0 + 1.95, y, w: 4.0, h: 0.75, fontSize: 13 });
  });
  label(sl, "THE SEARCH, 0.3 S PER ROUTE IN THE BENCHMARK", { x: 6.95, y: 3.35, w: 5.5, h: 0.25, color: STEEL });
  const steps = [
    "Start from nearest neighbour under that cost.",
    "Improve with asymmetric 2-opt, or-opt, and moves that lift a whole zone to a better place.",
    "Kick with double bridges, half of them cut at zone boundaries.",
    "Accept on cost plus 20 × seconds late, from a full schedule simulation.",
    "Repair windows: move whole zones first, single stops only if still late.",
  ];
  // explicit start numbers: some renderers restart automatic numbering on every paragraph
  text(sl, steps.map((t, i) => ({ text: t, options: { bullet: { type: "number", startAt: i + 1 }, breakLine: i < steps.length - 1 } })),
    { x: 6.95, y: 3.7, w: 5.75, h: 2.3, fontSize: 13, paraSpaceAfter: 5 });
  const trust = TRUST.map((t) => t.cfg ? `${t.label}: w ${t.cfg[0]}, crossing ${t.cfg[1]} s` : "off: travel time only (shortest path)").join("   ·   ");
  label(sl, `TRUST DIAL   ${trust.toUpperCase()}`, { x: X0, y: 6.3, w: CW, h: 0.5, fontSize: 9.5, color: INK2 });
  sl.addNotes("Every move between two stops gets a cost. Inside a zone it is just road time. Leaving a zone adds a flat crossing charge and a habit cost, minus the log of how likely drivers are to make that move. The search is iterated local search. The zone-block move matters: once leaving a zone is expensive, single-stop moves cannot reorder zones, so we move whole zones. The dial at the bottom is how much the dispatcher trusts the driver's habits.");
}

// ---------- 6. zone model ----------
{
  const sl = slide("CONTENT", "Evidence", "VALIDATION 1 · THE HABIT MODEL", "The model knows where drivers go next.");
  const rows = s.zone.rows;
  sl.addChart(pres.charts.BAR, [
    { name: "Baselines", labels: rows.map((r) => r.label), values: rows.map((r) => (r.hi ? 0 : r.value)) },
    { name: "Our ranker", labels: rows.map((r) => r.label), values: rows.map((r) => (r.hi ? r.value : 0)) },
  ], {
    x: X0, y: 1.85, w: 7.0, h: 3.9, barDir: "bar", barGrouping: "stacked", overlap: 100, barGapWidthPct: 55,
    chartColors: [GRAPHITE, CANCEL], showLegend: false, valAxisHidden: true, valAxisMaxVal: 1, valAxisMinVal: 0,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, catAxisLineShow: false,
    catAxisLabelFontFace: BODY, catAxisLabelFontSize: 14, catAxisLabelColor: INK,
    showValue: true, dataLabelPosition: "inEnd", dataLabelFormatCode: "0.0%;;;", dataLabelColor: FACE, dataLabelFontSize: 14, dataLabelFontBold: true,
    showTitle: true, title: "Top-1 accuracy, next zone", titleFontFace: BODY, titleFontSize: 13, titleColor: INK2,
  });
  label(sl, `${n0(s.zone.n)} HELD-OUT ZONE-TO-ZONE MOVES`, { x: X0, y: 5.85, w: 7, h: 0.25 });
  text(sl, `About ${Math.round(s.zone.candidates)} zones to choose from at each step. Chance would be under 5%.`, { x: X0, y: 6.15, w: 7, h: 0.5, fontSize: 12.5 });
  slot(sl, 8.0, 1.85, 4.73, 4.8);
  label(sl, "HOW IT WORKS", { x: 8.25, y: 2.05, w: 4.3, h: 0.25, color: STEEL });
  text(sl, [
    { text: "A LightGBM lambdarank model ranks every unvisited zone as the next one.", options: { bullet: true, breakLine: true } },
    { text: "Features: distance between zone centres and its rank among the candidates, steps between Amazon's zone codes (cluster, block, row, column), and how often drivers at this station made the same move on other days.", options: { bullet: true, breakLine: true } },
    { text: "Station history for a training route counts other days only, so the model never sees the answer.", options: { bullet: true, breakLine: true } },
    { text: "Scores become a habit cost of −log p for each move, which the search adds to travel time.", options: { bullet: true } },
  ], { x: 8.25, y: 2.4, w: 4.3, h: 4.1, fontSize: 13, paraSpaceAfter: 7 });
  sl.addNotes(`We checked the habit model on its own before trusting it. On ${n0(s.zone.n)} zone-to-zone moves from routes it never saw, it picks the driver's actual next zone ${pct0(R.zone_top1)} of the time. Picking the nearest zone gets ${pct0(R.zone_nearest)}, and station history alone gets ${pct0(R.zone_history)}.`);
}

// ---------- 7. headline results ----------
{
  const sl = slide("CONTENT", "Evidence", `RESULTS · ${n0(R.eval_routes)} HELD-OUT ROUTES`, `${f1(lot.saving)}% less driving, and closer to the driver than any optimizer.`);
  const hdr = ["Method", "Drive time vs driver", "95% interval", "Amazon score (0 = driver)", "Zone re-entries per route", "Late stops"].map((t, i) => ({
    text: t.toUpperCase(), options: { fontFace: MONO, fontSize: 9.5, color: INK2, bold: true, align: i ? "right" : "left", fill: { color: STEEL_SOFT } } }));
  const ci = (c) => `${f1(c[0])} to ${f1(c[1])}%`;
  const row = (name, m, ci_, hi) => [name, m === drv ? "baseline" : drive(m.saving), ci_ || "", m === drv ? "0" : f3(m.score), f2(m.reentries), n0(m.late)].map((t, i) => ({
    text: t, options: { align: i ? "right" : "left", bold: !!hi, color: hi ? CANCEL_INK : INK, fill: { color: hi ? "F6E9E4" : FACE } } }));
  sl.addTable([hdr,
    row("Driver's own order", drv),
    row("Nearest neighbour", nn),
    row("Shortest path (our engine, travel time only)", tsp, ci(R.tsp_ci)),
    row("Line of Travel, zones only", zonesOnly),
    row("Line of Travel, default", lot, ci(R.ci), true),
  ], { x: X0, y: 1.9, w: CW, colW: [4.0, 1.7, 1.6, 1.75, 1.7, 1.38], fontFace: BODY, fontSize: 13.5, color: INK,
    border: { type: "solid", pt: 0.75, color: RULE }, rowH: 0.48, valign: "middle", margin: [0, 0.1, 0, 0.1] });
  const ip = R.impact;
  stat(sl, X0, 5.0, 3.9, 1.8, `${n0(R.hours_saved)} h`, `of driving saved across the ${n0(R.eval_routes)} routes, about ${f1(ip.min_per_route)} minutes per route`, { kick: "DRIVER-HOURS", accent: CANCEL, size: 36 });
  stat(sl, X0 + 4.12, 5.0, 3.9, 1.8, `${f1(R.median_saving)}%`, "saved on the median route: half of all routes save more than this", { kick: "MEDIAN ROUTE", size: 36 });
  stat(sl, X0 + 8.24, 5.0, 3.89, 1.8, pct1(R.worse), `of routes drive longer than the driver did; ${pct1(R.worse4)} by more than 4%`, { kick: "ROUTES THAT LOSE", size: 36 });
  sl.addNotes(`The headline table. Every number is on the ${n0(R.eval_routes)} evaluation routes. The default setting cuts drive time by ${f1(lot.saving)}%, with a bootstrap interval of ${ci(R.ci)}. Its Amazon score, which measures distance from the driver's real order, is ${f3(lot.score)}, lower than the shortest path's ${f3(tsp.score)}, so it is closer to what the driver does. Late stops fall from ${n0(drv.late)} to ${n0(lot.late)}.`);
}

// ---------- 8. trade-off ----------
{
  const sl = slide("CONTENT", "Evidence", "THE TRADE-OFF", "Trust is a dial. Each setting is a different deal with the driver.");
  const pts = s.frontier;
  const base = pts.filter((p) => !p.lot), ours = pts.filter((p) => p.lot).sort((a, b) => a.score - b.score);
  const xs = [...base, ...ours].map((p) => p.score);
  const lbl = (p) => (p.lot ? (p.primary ? "Default" : p.key === "habit_0_600" ? "Zones only" : p.key === "habit_300_1200" ? "Max trust" : "") : p.label);
  sl.addChart(pres.charts.SCATTER, [
    { name: "Score", values: xs },
    { name: "Baselines", values: [...base.map((p) => p.saving), ...ours.map(() => null)], labels: [[...base.map(lbl), ...ours.map(() => "")]] },
    { name: "Line of Travel", values: [...base.map(() => null), ...ours.map((p) => p.saving)], labels: [[...base.map(() => ""), ...ours.map(lbl)]] },
  ], {
    x: X0, y: 1.8, w: 7.6, h: 4.95, chartColors: [GRAPHITE, CANCEL], lineSize: 0, lineDataSymbol: "circle", lineDataSymbolSize: 11,
    showLegend: true, legendPos: "b", legendFontFace: BODY, legendFontSize: 11, legendColor: INK2,
    showLabel: true, dataLabelFormatScatter: "custom", dataLabelPosition: "r", dataLabelFontFace: BODY, dataLabelFontSize: 11, dataLabelColor: INK,
    showValAxisTitle: true, valAxisTitle: "Drive time saved vs the driver (%)", valAxisTitleFontSize: 11, valAxisTitleColor: INK2,
    showCatAxisTitle: true, catAxisTitle: "Amazon score: distance from the driver's real order (0 = identical)", catAxisTitleFontSize: 11, catAxisTitleColor: INK2,
    valAxisLabelFontFace: MONO, valAxisLabelFontSize: 10, valAxisLabelColor: INK3, catAxisLabelFontFace: MONO, catAxisLabelFontSize: 10, catAxisLabelColor: INK3,
    // pptxgenjs writes one number format to both axes of a scatter, so let each axis format itself
    valAxisLabelFormatCode: "General", catAxisMinVal: 0, valAxisMinVal: -4, valAxisMaxVal: 14, valAxisCrossesAt: -4, // scatter: this option sets where the x axis crosses y
    valGridLine: { color: "DFE2DA", size: 0.75 }, catGridLine: { style: "none" },
  });
  const rows = [
    ["Shortest path", `${drive(tsp.saving)} drive time, but ${f1(tsp.reentries)} zone re-entries per route.`, GRAPHITE],
    ["Zones only", `${drive(zonesOnly.saving)}. Keeps zones whole, ignores the driver's zone order.`, CANCEL],
    ["Default", `${drive(lot.saving)}. Keeps zones whole and follows the usual order. Score ${f3(lot.score)}.`, CANCEL],
    ["High and max trust", `${drive(M.habit_60_600.saving)} and ${drive(M.habit_300_1200.saving)}. For stations that want plans closest to habit.`, CANCEL],
  ];
  rows.forEach(([k, v, c], i) => {
    const y = 1.95 + i * 1.18;
    slot(sl, 8.55, y, 4.18, 1.02, { accent: c });
    text(sl, k, { x: 8.8, y: y + 0.12, w: 3.8, h: 0.3, fontFace: HEAD, fontSize: 16, bold: true, color: INK });
    text(sl, v, { x: 8.8, y: y + 0.45, w: 3.8, h: 0.55, fontSize: 11.5 });
  });
  sl.addNotes("This chart is the core trade-off. Up is less driving. Left is closer to what the driver really did. A pure optimizer sits top right: short but alien. The driver sits at zero, zero. Line of Travel's settings form a curve between them, and the dispatcher picks the point. The default is the knee: most of the zone-keeping benefit, while staying closest to the driver's order.");
}

// ---------- 9. distribution and quality labels ----------
{
  const q = s.quality;
  const agrees = q.kind === "ordered" || q.kind === "agree";
  const qTitle = agrees ? "It holds route by route, and matches Amazon's own ratings."
    : q.kind === "flat" ? "It holds route by route, and the waste is on well-rated routes too." : "It holds route by route.";
  const sl = slide("CONTENT", "Evidence", "VALIDATION 2 · ROUTE BY ROUTE", qTitle);
  const h = s.hist;
  const cats = [`<${h.bins[0].x0}`, ...h.bins.map((b) => `${b.x0}`), `${h.bins[h.bins.length - 1].x1}+`];
  const vals = [h.under.count, ...h.bins.map((b) => b.count), h.over.count];
  const neg = (i) => i === 0 || (i <= h.bins.length && h.bins[i - 1].x1 <= 0);
  sl.addChart(pres.charts.BAR, [
    { name: "Drives longer", labels: cats, values: vals.map((v, i) => (neg(i) ? v : 0)) },
    { name: "Saves time", labels: cats, values: vals.map((v, i) => (neg(i) ? 0 : v)) },
  ], {
    x: X0, y: 1.8, w: 6.55, h: 4.3, barDir: "col", barGrouping: "stacked", overlap: 100, barGapWidthPct: 25,
    chartColors: [GRAPHITE, CANCEL], showLegend: true, legendPos: "t", legendFontFace: BODY, legendFontSize: 11, legendColor: INK2,
    catAxisLabelFontFace: MONO, catAxisLabelFontSize: 9, catAxisLabelColor: INK3, valAxisLabelFontFace: MONO, valAxisLabelFontSize: 9, valAxisLabelColor: INK3,
    valGridLine: { color: "DFE2DA", size: 0.75 }, catGridLine: { style: "none" },
    showCatAxisTitle: true, catAxisTitle: "Drive time saved per route vs the driver (%)", catAxisTitleFontSize: 11, catAxisTitleColor: INK2,
    showValAxisTitle: true, valAxisTitle: "Routes", valAxisTitleFontSize: 11, valAxisTitleColor: INK2,
  });
  text(sl, `${n0(h.n)} held-out routes at the default setting. Median ${f1(h.median)}%. ${pct1(h.worse)} of routes drive longer than the driver did.`, { x: X0, y: 6.2, w: 6.55, h: 0.6, fontSize: 12.5 });
  if (q.rows.length) {
    sl.addChart(pres.charts.BAR, [
      { name: "Other labels", labels: q.rows.map((r) => r.label), values: q.rows.map((r) => (r.hi ? 0 : r.value)) },
      { name: "Highlighted", labels: q.rows.map((r) => r.label), values: q.rows.map((r) => (r.hi ? r.value : 0)) },
    ], {
      x: 7.55, y: 1.8, w: 5.18, h: 3.2, barDir: "bar", barGrouping: "stacked", overlap: 100, barGapWidthPct: 60,
      chartColors: [GRAPHITE, CANCEL], showLegend: false, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
      catAxisLabelFontFace: BODY, catAxisLabelFontSize: 13, catAxisLabelColor: INK, catAxisLineShow: false,
      showValue: true, dataLabelPosition: "inEnd", dataLabelFormatCode: '0.0"%";;;', dataLabelColor: FACE, dataLabelFontSize: 13, dataLabelFontBold: true,
      showTitle: true, title: "Median drive time a shortest path recovers", titleFontFace: BODY, titleFontSize: 12, titleColor: INK2,
    });
    text(sl, [{ text: `${q.title} `, options: { bold: true, color: INK } }, { text: q.sub }], { x: 7.55, y: 5.15, w: 5.18, h: 1.6, fontSize: 12.5 });
  }
  sl.addNotes(`Two more checks. Left: savings route by route, not just on average. Most routes save; ${pct1(h.worse)} drive longer, mostly by a little. Right: Amazon labelled its training routes High, Medium or Low quality. We asked whether the waste we recover sits only on badly rated routes. ${q.title} ${q.sub}`);
}

// ---------- 10. scenarios ----------
{
  const sc = s.scenarios;
  const rushRow = sc && sc.rows.find((r) => r.key === "rush");
  const scTitle = rushRow && rushRow.lot.late === 0 ? "A late van keeps its saving. Rush orders keep every deadline." : "When the day goes wrong.";
  const sl = slide("CONTENT", "Evidence", `SCENARIO ANALYSIS · ${sc ? sc.routes : 0} HELD-OUT ROUTES`, scTitle);
  if (sc) {
    const hdr = ["Scenario", "What changes", "Drive time, Line of Travel", "Drive time, shortest path", "Late stops: driver", "Late stops: Line of Travel", "Re-entries, Line of Travel"].map((t, i) => ({
      text: t.toUpperCase(), options: { fontFace: MONO, fontSize: 9, color: INK2, bold: true, align: i > 1 ? "right" : "left", fill: { color: STEEL_SOFT } } }));
    const what = { base: "The day as planned.", late: "Van leaves 45 minutes late, so every window closes 45 minutes sooner.", rush: "8 same-day orders near existing stops, each due within 4 hours. Driver inserts each where it adds least time." };
    const rows = sc.rows.map((r) => [r.label, what[r.key], drive(r.lot.saving), drive(r.tsp.saving), n0(r.driver.late), n0(r.lot.late), f2(r.lot.reentries)].map((t, i) => ({
      text: t, options: { align: i > 1 ? "right" : "left", fontSize: i === 1 ? 11.5 : 13.5, bold: i === 2 || i === 5, color: i === 2 || i === 5 ? CANCEL_INK : INK, fill: { color: FACE } } })));
    sl.addTable([hdr, ...rows], { x: X0, y: 1.9, w: CW, colW: [2.05, 3.85, 1.35, 1.35, 1.15, 1.25, 1.13], fontFace: BODY, fontSize: 13.5, color: INK,
      border: { type: "solid", pt: 0.75, color: RULE }, rowH: [0.62, 0.72, 0.72, 0.72], valign: "middle", margin: [0, 0.1, 0, 0.1] });
    const late = sc.rows.find((r) => r.key === "late"), rush = sc.rows.find((r) => r.key === "rush");
    const cards = [
      ["LATE START", `${n0(late.driver.late)} → ${n0(late.lot.late)}`, `late stops after a 45-minute late start; drive time still ${drive(late.lot.saving)}`],
      ["RUSH ORDERS", `${n0(rush.driver.late)} → ${n0(rush.lot.late)}`, `missed deadlines with 8 rush orders, for ${drive(rush.lot.saving)} drive time`],
      ["ZONES KEPT", `${f2(rush.lot.reentries)} vs ${f1(rush.tsp.reentries)}`, "zone re-entries per route with rush orders: ours vs shortest path"],
    ];
    cards.forEach(([k, v, c], i) => stat(sl, X0 + i * 4.12, 5.0, i === 2 ? 3.89 : 3.9, 1.8, v, c, { kick: k, accent: i === 0 ? CANCEL : undefined, size: 34 }));
    sl.addNotes(`The brief asks for scenario analysis, so we stress-tested ${sc.routes} held-out routes. Late start: the van leaves 45 minutes late, so every time window closes sooner. Line of Travel keeps its saving, ${drive(late.lot.saving)}, and cuts late stops from ${n0(late.driver.late)} to ${n0(late.lot.late)}. Rush: eight same-day orders appear near existing stops, each due within four hours, and the baseline slots each one in where it adds the least driving. That baseline misses ${n0(rush.driver.late)} deadlines. Line of Travel misses ${n0(rush.lot.late)}, and it pays with ${drive(rush.lot.saving)} drive time, because meeting those deadlines means breaking some of the driver's zone order. The shortest path drives less, but re-enters ${f1(rush.tsp.reentries)} zones per route. On a day like this a dispatcher would turn the trust dial down.`);
  }
}

// ---------- 11. rigor ----------
{
  const sl = slide("CONTENT", "Evidence", "HOW WE CHECKED", "Every number is reproducible from one script.");
  const strip = (h) => h.replace(/<[^>]+>/g, "");
  const items = s.checks.map((c) => { const m = c.match(/^<b>(.*?)<\/b>\s*(.*)$/); return m ? [m[1], strip(m[2])] : ["", strip(c)]; });
  const colW = (CW - 0.4) / 2, per = Math.ceil(items.length / 2);
  const rowH = Math.min(1.12, 4.95 / per);
  items.forEach(([k, v], i) => {
    const col = Math.floor(i / per), r = i % per;
    const x = X0 + col * (colW + 0.4), y = 1.85 + r * rowH;
    sl.addShape(pres.shapes.LINE, { x, y, w: colW, h: 0, line: { color: RULE, width: 0.75 } });
    text(sl, [{ text: `${k} `, options: { bold: true, color: INK } }, { text: v }], { x: x + 0.05, y: y + 0.1, w: colW - 0.1, h: rowH - 0.15, fontSize: 12 });
  });
  sl.addNotes("Rigor slide. The model trains on training routes and every result is on held-out routes. Our scorer matches Amazon's official scorer exactly. Intervals are bootstrapped over routes. Our engine's plain shortest path is checked against Google OR-Tools. And the ablation: our first engine lost to the driver on too many routes. We found the cause, a time-window repair that broke zones apart, fixed it, and re-ran everything.");
}

// ---------- 12. live demo ----------
{
  const sl = slide("CONTENT", "Product", "LIVE DEMO", "Pick a real route. Decide how much to trust the driver.");
  if (has("desk")) sl.addImage({ ...fit(img("desk"), X0, 1.8, 8.6, 5.0, "left"), altText: "The dispatch desk: route picker, trust dial, map and comparison table" });
  const x = 9.45, w = W - X0 - x;
  slot(sl, x, 1.8, w, 5.0, { accent: CANCEL });
  label(sl, "TRY IT", { x: x + 0.28, y: 2.0, w: w - 0.4, h: 0.25, color: CANCEL_INK });
  text(sl, [
    { text: `${demoRoutes} real held-out routes from 5 cities.`, options: { bullet: true, breakLine: true } },
    { text: "Trust dial from shortest path to the driver's habits.", options: { bullet: true, breakLine: true } },
    { text: "What-if: late start, or 8 same-day orders.", options: { bullet: true, breakLine: true } },
    { text: "Drive time, day length, late stops, zone re-entries and Amazon score, side by side.", options: { bullet: true, breakLine: true } },
    { text: "Solved in your browser by the benchmark's own engine: 0.4 to 0.7 s a route on an M4 Pro laptop. No backend.", options: { bullet: true } },
  ], { x: x + 0.28, y: 2.35, w: w - 0.5, h: 3.2, fontSize: 13, paraSpaceAfter: 6 });
  label(sl, "OPEN", { x: x + 0.28, y: 5.75, w: w - 0.4, h: 0.25, color: STEEL });
  text(sl, demo, { x: x + 0.28, y: 6.02, w: w - 0.45, h: 0.65, fontFace: MONO, fontSize: 11.5, color: INK, hyperlink: s.links.demo ? { url: s.links.demo } : undefined });
  sl.addNotes("This is the working demo. Pick a city and a real held-out route, set how much to trust the driver, and choose a scenario. The engine runs in a Web Worker in the browser, the same code as the benchmark, with a fixed number of search rounds so the same route always gives the same answer. The postmark stamps the result: minutes saved and how many zones kept their order.");
}

// ---------- 13. impact ----------
{
  const ip = R.impact;
  const sl = slide("CONTENT", "Product", "IMPACT AND FEASIBILITY", "Minutes per van, every day, with nothing new to install.");
  stat(sl, X0, 1.85, 3.9, 1.9, `${f1(ip.min_per_route)} min`, "less driving per route per day at the default setting, on held-out routes", { kick: "PER VAN", accent: CANCEL, size: 40 });
  stat(sl, X0 + 4.12, 1.85, 3.9, 1.9, `${f1(ip.station_hours_day)} h`, `of driving saved per day at a ${ip.vans}-van station`, { kick: "PER STATION", size: 40 });
  stat(sl, X0 + 8.24, 1.85, 3.89, 1.9, `$${n0(ip.station_usd_year / 1000)}k`, `a year per station at the BLS 2025 median wage for delivery drivers ($${ip.wage}/h), ${ip.days} days`, { kick: "PER YEAR", size: 40 });
  label(sl, "HOW IT FITS INTO A STATION", { x: X0, y: 4.05, w: 6, h: 0.25, color: STEEL });
  const steps = [
    ["Plan", "The station's planner assigns stops to vans, as today."],
    ["Re-sequence", "Line of Travel orders each van's stops in well under a second, in a browser."],
    ["Dial", "Each station sets its trust level. New drivers can start nearer the shortest path."],
    ["Learn", "Each day's completed routes add to the station history the model reads."],
  ];
  const sw = (CW - 3 * 0.25) / 4;
  steps.forEach(([k, v], i) => {
    const x = X0 + i * (sw + 0.25);
    slot(sl, x, 4.4, sw, 1.5);
    text(sl, `${i + 1}  ${k}`, { x: x + 0.22, y: 4.55, w: sw - 0.4, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: INK });
    text(sl, v, { x: x + 0.22, y: 4.98, w: sw - 0.4, h: 0.85, fontSize: 12 });
  });
  text(sl, `Fewer late deliveries too: ${n0(drv.late)} late stops in the drivers' own orders, ${n0(lot.late)} with Line of Travel, across ${n0(R.windowed_stops)} stops with a window. The US has about 1.5 million delivery truck driver jobs (BLS 2025).`,
    { x: X0, y: 6.1, w: CW, h: 0.7, fontSize: 12.5 });
  sl.addNotes(`Impact in plain numbers: ${f1(ip.min_per_route)} minutes less driving per van per day. At a hundred-van station that is ${f1(ip.station_hours_day)} driver-hours a day, about $${n0(ip.station_usd_year / 1000)} thousand a year at the median wage, before fuel and emissions. Feasibility: it needs only the data a station already has, runs in a fraction of a second on any device, and slots in after stop assignment.`);
}

// ---------- 14. responsible use ----------
{
  const sl = slide("CONTENT", "Product", "RESPONSIBLE USE AND LIMITS", "It keeps the driver's knowledge. Here is what it cannot know.");
  const colW = (CW - 0.35) / 2;
  const col = (x, kick, accent, items) => {
    slot(sl, x, 1.85, colW, 4.95, { accent });
    label(sl, kick, { x: x + 0.3, y: 2.05, w: colW - 0.5, h: 0.25, color: accent === CANCEL ? CANCEL_INK : STEEL });
    text(sl, items.flatMap(([k, v], i) => [{ text: `${k} `, options: { bold: true, color: INK } }, { text: v, options: { breakLine: i < items.length - 1 } }]),
      { x: x + 0.3, y: 2.42, w: colW - 0.55, h: 4.25, fontSize: 13, paraSpaceAfter: 9 });
  };
  col(X0, "WHAT IT PROTECTS", CANCEL, [
    ["Driver judgment.", "It starts from how drivers already work instead of overriding it, and a dial decides how far it may depart."],
    ["Deliveries.", "Lateness is part of the objective, so saving minutes never comes from missing a window."],
    ["Privacy.", "Only stops, zones and travel times. No driver identity, no customer names, no GPS traces."],
    ["Explainability.", "Every choice is road time plus two named charges a dispatcher can read and change."],
  ]);
  col(X0 + colW + 0.35, "LIMITS", STEEL, [
    ["Planned, not driven.", "Savings are measured in Amazon's travel-time estimates, not GPS. Drivers may know shortcuts the matrix does not."],
    ["Habits are not always good.", "Some habits are detours. That is why the dial exists, and why the default does not trust habit fully."],
    ["Five US metros, 2018.", "Other countries, vehicles or seasons need their own history before the habit model is trusted."],
    ["Research licence.", "The dataset is CC BY-NC 4.0, so a commercial rollout would retrain on the operator's own routes."],
  ]);
  sl.addNotes("Responsible use. The design choice that matters most is that it learns from drivers rather than overriding them, and the dispatcher controls how far it departs. Lateness is in the objective. No personal data. The limits are real: savings are in Amazon's planned travel times, not GPS, and habits can encode detours, which is why the default is moderate trust, not full trust.");
}

// ---------- 15. close ----------
{
  const sl = slide("CLOSE", "Close", "LINE OF TRAVEL", "Keep the order drivers already know.");
  text(sl, "Remove the detours.", { x: X0, y: 2.78, w: 8.4, h: 0.9, fontFace: HEAD, fontSize: 54, bold: true, color: CANCEL });
  const rows = [["LIVE DEMO", demo], ["CODE AND REPRODUCTION", repo], ["DATA", "Amazon Last Mile Routing Research Challenge 2021, CC BY-NC 4.0"]];
  rows.forEach(([k, v], i) => {
    label(sl, k, { x: X0, y: 4.25 + i * 0.68, w: 3, h: 0.25, color: MANILA });
    text(sl, v, { x: X0, y: 4.5 + i * 0.68, w: 8.5, h: 0.35, fontFace: MONO, fontSize: 13, color: FACE });
  });
  if (has("postmark")) sl.addImage({ ...fit(img("postmark"), 8.3, 1.0, 4.5, 2.6), altText: "Postmark stamp reading Line of Travel" });
  label(sl, "SANCHAY SINGH · SOLO ENTRY · DATANOVA 2026", { x: X0, y: 6.4, w: CW, h: 0.3, color: GRAPHITE });
  sl.addNotes(`To close: an optimizer that drivers ignore saves nothing. Line of Travel learns the order drivers already use and removes only the detours: ${f1(lot.saving)}% less driving on ${n0(R.eval_routes)} held-out routes, zones kept whole, fewer late stops, in a third of a second. Thank you.`);
}

await pres.writeFile({ fileName: OUT });
console.log(OUT);
