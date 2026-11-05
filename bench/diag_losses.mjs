// Why does Line of Travel drive longer than the driver on some routes?
// For routes that lose by more than 4%, compare both tours under our own objective C.
// If C(ours) > C(driver), the search missed a better tour. If C(ours) < C(driver), the cost model
// itself prefers a longer drive (crossing or habit charges outweigh the travel time).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { solveRoute, habitCosts, tourCost, zoneReentries } from "../web/src/engine/solver.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, "data", "processed");
const [w, x] = (process.argv[2] || "30:300").split(":").map(Number);
const limit = +(process.argv[3] || 40);

const src = process.argv[4] || path.join(ROOT, "docs/results/bench_eval.jsonl");
const rows = fs.readFileSync(src, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const key = `habit_${w}_${x}`;
const losers = rows.filter((r) => (r.m.driver.travel - r.m[key].travel) / r.m.driver.travel < -0.04).slice(0, limit);
const bench = JSON.parse(fs.readFileSync(path.join(P, "bench_eval.json"), "utf8"));
const byId = new Map(bench.routes.map((r) => [r.id, r]));
const ttFd = fs.openSync(path.join(P, "tt_eval.npy"), "r");
const hdr = Buffer.alloc(12); fs.readSync(ttFd, hdr, 0, 12, 0);
const ttBase = hdr[6] === 1 ? 10 + hdr.readUInt16LE(8) : 12 + hdr.readUInt32LE(8);
const hFd = fs.openSync(path.join(P, "habit_eval.bin"), "r");
const f32 = (fd, base, off, cnt) => { const b = Buffer.alloc(cnt * 4); fs.readSync(fd, b, 0, cnt * 4, base + off * 4); return new Float32Array(b.buffer, b.byteOffset, cnt); };

let searchMiss = 0, modelPrefers = 0;
const out = [];
for (const row of losers) {
  const r = byId.get(row.id), n = r.n;
  const T = f32(ttFd, ttBase, r.tt, n * n), H = f32(hFd, 0, r.h, r.k * r.k);
  const zone = Int32Array.from(r.zone);
  const C = habitCosts(T, n, zone, H, r.k, w, x);
  const f64 = (a, fill) => Float64Array.from(a, (v) => (v == null ? fill : v));
  const tw = { service: f64(r.service, 0), twStart: f64(r.twStart, -Infinity), twEnd: f64(r.twEnd, Infinity) };
  const sol = solveRoute({ n, T, C, zone, timeLimitMs: 300, seed: 1, ...tw });
  const drv = Int32Array.from(r.actual);
  const cD = tourCost(drv, C, n), cL = tourCost(sol.tour, C, n);
  const tD = tourCost(drv, T, n), tL = tourCost(sol.tour, T, n);
  // a warm start from the driver's tour shows how much better the search could do under C
  const warm = solveRoute({ n, T, C, zone, timeLimitMs: 300, seed: 1, init: drv, ...tw });
  const tW = tourCost(warm.tour, T, n), cW = tourCost(warm.tour, C, n);
  if (cL > cD) searchMiss++; else modelPrefers++;
  out.push({ id: row.id.slice(8, 16), st: r.station, n, k: r.k, drvRe: zoneReentries(drv, zone, n),
    tDrv: Math.round(tD), tLot: Math.round(tL), tWarm: Math.round(tW), cDrv: Math.round(cD), cLot: Math.round(cL), cWarm: Math.round(cW) });
}
console.table(out);
console.log(`${losers.length} losing routes: search missed a cheaper tour on ${searchMiss}, cost model prefers the longer drive on ${modelPrefers}`);
