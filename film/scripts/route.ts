// Solves the site's hero route with the site's own engine, exactly as the browser worker does
// (seed 1, the same fixed search rounds), and writes what the teaser draws: public/route.json
//
//   stops projected into the film frame, zone hulls, the three tours (driver, shortest path,
//   Line of Travel), the stops where each tour drives back into a finished zone, the carrier
//   case, and the numbers the narration quotes.
//
//   node scripts/route.ts

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Plain JavaScript shared with the website.
import { solveRoute, simulate, habitCosts, zoneReentries, tourCost } from "../../web/src/engine/solver.js";
import { routeScore, normalizeMatrix } from "../../web/src/engine/score.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = join(root, "..", "web", "public", "data");
const summary = JSON.parse(readFileSync(join(data, "summary.json"), "utf8"));
const routes = JSON.parse(readFileSync(join(data, "routes.json"), "utf8"));
const meta = routes.find((r: { id: string }) => r.id === summary.hero);

const n: number = meta.n;
const k: number = meta.k;
const buf = readFileSync(join(data, "r", `${meta.id}.bin`));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const T = new Float32Array(ab, 0, n * n);
const H = new Float32Array(ab, n * n * 4, k * k);
const f64 = (a: (number | null)[], fill: number) => Float64Array.from(a, (x) => (x == null ? fill : x));
const r = {
  n, k, T, H,
  zone: Int32Array.from(meta.zone),
  service: f64(meta.service, 0),
  twStart: f64(meta.twStart, -Infinity),
  twEnd: f64(meta.twEnd, Infinity),
  actual: Int32Array.from(meta.actual),
};

// The browser's default trust setting (web/src/data.js, TRUST[2]) and its fixed search rounds.
const CFG = [30, 300];
function solve(cfg: number[] | null) {
  const base = { n, T, service: r.service, twStart: r.twStart, twEnd: r.twEnd, timeLimitMs: 4000, maxIters: cfg ? 280 : 470, seed: 1 };
  const C = cfg ? habitCosts(T, n, r.zone, H, k, cfg[0], cfg[1]) : undefined;
  return solveRoute({ ...base, C, zone: cfg ? r.zone : undefined }).tour as Int32Array;
}
const norm = normalizeMatrix(T, n);
function measure(tour: Int32Array) {
  const s = simulate(tour, T, n, r.service, r.twStart, r.twEnd);
  return {
    travel: tourCost(tour, T, n),
    duration: s.duration,
    late: s.lateStops,
    reentries: zoneReentries(tour, r.zone, n),
    score: routeScore(Array.from(r.actual), Array.from(tour), T, n, norm),
  };
}

const tours = { driver: r.actual, tsp: solve(null), lot: solve(CFG) };
const metrics = Object.fromEntries(Object.entries(tours).map(([key, t]) => [key, measure(t)]));

// Project the delivery stops (not the station, which is far away) into the film frame.
const FRAME = { x: 300, y: 120, w: 1320, h: 840 };
const kx = Math.cos((meta.lat[0] * Math.PI) / 180);
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (let i = 1; i < n; i++) {
  const x = meta.lng[i] * kx, y = meta.lat[i];
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
}
const s = Math.min(FRAME.w / (x1 - x0), FRAME.h / (y1 - y0));
const ox = FRAME.x + (FRAME.w - s * (x1 - x0)) / 2;
const oy = FRAME.y + (FRAME.h - s * (y1 - y0)) / 2;
const round = (v: number) => Math.round(v * 10) / 10;
const pts = Array.from({ length: n }, (_, i) =>
  i === 0 ? [0, 0] : [round(ox + (meta.lng[i] * kx - x0) * s), round(FRAME.y + FRAME.h - (oy - FRAME.y + (meta.lat[i] - y0) * s))],
);

// Zone hulls (Andrew's monotone chain), padded a little so single stops still show.
function hull(p: number[][]) {
  const q = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (q.length < 3) return q;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], hi: number[][] = [];
  for (const v of q) { while (lo.length >= 2 && cross(lo.at(-2)!, lo.at(-1)!, v) <= 0) lo.pop(); lo.push(v); }
  for (const v of [...q].reverse()) { while (hi.length >= 2 && cross(hi.at(-2)!, hi.at(-1)!, v) <= 0) hi.pop(); hi.push(v); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
const zones = new Map<number, number[]>();
for (let i = 1; i < n; i++) zones.set(r.zone[i], [...(zones.get(r.zone[i]) ?? []), i]);
const hulls = [...zones.entries()].map(([z, stops]) => {
  const p = stops.map((i) => pts[i]);
  const cx = p.reduce((a, v) => a + v[0], 0) / p.length;
  const cy = p.reduce((a, v) => a + v[1], 0) / p.length;
  const h = hull(p).map(([x, y]) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [round(x + (dx / d) * 14), round(y + (dy / d) * 14)];
  });
  return { zone: z, name: meta.zones[z], stops: stops.length, c: [round(cx), round(cy)], hull: h };
});

/** Stops where a tour drives back into a zone it already left. */
function reentryStops(tour: Int32Array) {
  const seen = new Set<number>();
  const out: number[] = [];
  let prev = -1;
  for (let i = 1; i < tour.length; i++) {
    const z = r.zone[tour[i]];
    if (z !== prev) { if (seen.has(z)) out.push(tour[i]); seen.add(z); prev = z; }
  }
  return out;
}

// The carrier case, as web/src/case.js lays it out: zones in the driver's order.
function zoneOrder(tour: Int32Array) {
  const order: number[] = [];
  const seen = new Set<number>();
  for (let i = 1; i < tour.length; i++) { const z = r.zone[tour[i]]; if (!seen.has(z)) { seen.add(z); order.push(z); } }
  return order;
}
const drv = zoneOrder(tours.driver);
const lot = zoneOrder(tours.lot);
const prevOf = (o: number[]) => new Map(o.map((z, i) => [z, i ? o[i - 1] : -1]));
const pd = prevOf(drv), pl = prevOf(lot);
const caseSlots = drv.map((z) => ({ zone: z, name: meta.zones[z], stops: zones.get(z)!.length, lot: lot.indexOf(z) + 1, moved: pd.get(z) !== pl.get(z) }));

// Every sample route on the site, in its driver's order, fitted to a unit square: the teaser's
// wall of real routes.
const tiles = routes.map((m: { lat: number[]; lng: number[]; actual: number[]; station: string }) => {
  const k = Math.cos((m.lat[0] * Math.PI) / 180);
  const p = m.actual.slice(1).map((i) => [m.lng[i] * k, m.lat[i]]);
  const xs = p.map((v) => v[0]), ys = p.map((v) => v[1]);
  const [a, b, c, d] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sc = 1 / Math.max(b - a, d - c);
  const ox2 = (1 - sc * (b - a)) / 2, oy2 = (1 - sc * (d - c)) / 2;
  return { station: m.station, pts: p.map(([x, y]) => [Math.round((ox2 + (x - a) * sc) * 1000) / 1000, Math.round((1 - oy2 - (y - c) * sc) * 1000) / 1000]) };
});

const minutes = Math.round((metrics.lot.travel - metrics.driver.travel) / 60);
const out = {
  id: meta.id,
  station: meta.station,
  date: meta.date,
  stops: n - 1,
  zones: drv.length,
  pts,
  hulls,
  tours: Object.fromEntries(Object.entries(tours).map(([key, t]) => [key, Array.from(t)])),
  reentries: Object.fromEntries(Object.entries(tours).map(([key, t]) => [key, reentryStops(t)])),
  metrics,
  case: caseSlots,
  tiles,
  minutes,
  kept: caseSlots.filter((c) => !c.moved).length,
};
mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "route.json"), JSON.stringify(out) + "\n");
const pct = (a: number, b: number) => ((100 * (a - b)) / b).toFixed(1);
console.log(`${meta.station} ${meta.date}: ${n - 1} stops, ${drv.length} zones`);
for (const [key, m] of Object.entries(metrics)) {
  console.log(`  ${key.padEnd(6)} travel ${(m.travel / 3600).toFixed(2)} h (${pct(m.travel, metrics.driver.travel)}%)  re-entries ${m.reentries}  late ${m.late}  score ${m.score.toFixed(3)}`);
}
console.log(`  postmark: ${minutes} min, ${out.kept}/${drv.length} zones kept`);
