// Prints what the site's dispatch desk shows for the route it opens on, at every trust setting
// and in each what-if, using the site's own engine and scenarios. The narration quotes these.
//
//   node scripts/desk.ts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Plain JavaScript shared with the website.
import { solveRoute, simulate, habitCosts, zoneReentries, tourCost } from "../../web/src/engine/solver.js";
import { TRUST, lateStart, rushOrders, cityOf } from "../../web/src/data.js";

const data = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "public", "data");
const summary = JSON.parse(readFileSync(join(data, "summary.json"), "utf8"));
const routes = JSON.parse(readFileSync(join(data, "routes.json"), "utf8"));

// The desk opens on the first route of the first city that is not the hero's (web/src/main.js).
const byCity = new Map<string, typeof routes>();
for (const r of routes) byCity.set(cityOf(r.station), [...(byCity.get(cityOf(r.station)) ?? []), r]);
const heroCity = cityOf(routes.find((r: { id: string }) => r.id === summary.hero).station);
const city = [...byCity.keys()].find((c) => c !== heroCity)!;
const meta = byCity.get(city)![0];

function load(m: typeof meta) {
  const n = m.n, k = m.k;
  const buf = readFileSync(join(data, "r", `${m.id}.bin`));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const f64 = (a: (number | null)[], fill: number) => Float64Array.from(a, (x) => (x == null ? fill : x));
  return {
    ...m, T: new Float32Array(ab, 0, n * n), H: new Float32Array(ab, n * n * 4, k * k),
    zone: Int32Array.from(m.zone), service: f64(m.service, 0), twStart: f64(m.twStart, -Infinity),
    twEnd: f64(m.twEnd, Infinity), actual: Int32Array.from(m.actual),
  };
}

function solve(r: ReturnType<typeof load>, cfg: number[] | null) {
  const base = { n: r.n, T: r.T, service: r.service, twStart: r.twStart, twEnd: r.twEnd, timeLimitMs: 4000, maxIters: cfg ? 280 : 470, seed: 1 };
  const C = cfg ? habitCosts(r.T, r.n, r.zone, r.H, r.k, cfg[0], cfg[1]) : undefined;
  return solveRoute({ ...base, C, zone: cfg ? r.zone : undefined }).tour;
}
const fmt = (r: ReturnType<typeof load>, t: Int32Array) => {
  const s = simulate(t, r.T, r.n, r.service, r.twStart, r.twEnd);
  return `drive ${(tourCost(t, r.T, r.n) / 3600).toFixed(2)} h  day ${(s.duration / 3600).toFixed(2)} h  late ${s.lateStops}  re-entries ${zoneReentries(t, r.zone, r.n)}`;
};

const base = load(meta);
console.log(`${city}: ${meta.station} ${meta.date}, ${meta.n - 1} stops (${byCity.get(city)!.length} routes in this city, ${routes.length} in all)`);
console.log(`  driver          ${fmt(base, base.actual)}`);
TRUST.forEach((level: { label: string; cfg: number[] | null }) => console.log(`  ${level.label.padEnd(15)} ${fmt(base, solve(base, level.cfg))}`));
for (const [name, r] of [["late 45 min", lateStart(base, 45)], ["8 rush orders", rushOrders(base, 8, 4)]] as const) {
  console.log(`${name}`);
  console.log(`  driver          ${fmt(r, r.actual)}`);
  console.log(`  medium          ${fmt(r, solve(r, TRUST[2].cfg))}`);
  console.log(`  shortest path   ${fmt(r, solve(r, null))}`);
}
