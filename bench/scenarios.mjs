// Scenario analysis on held-out routes, using the same scenario code as the website (web/src/data.js).
//   base   the day as planned
//   late   the van leaves 45 minutes late (every window closes 45 minutes earlier)
//   rush   8 same-day orders added near existing stops, due within 4 hours;
//          the driver baseline inserts each where it adds the least travel time
// For each: driver's order vs Line of Travel (default trust) vs shortest path.
// Usage: node bench/scenarios.mjs --limit 400 --workers 4
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { solveRoute, simulate, habitCosts, zoneReentries, tourCost } from "../web/src/engine/solver.js";
import { lateStart, rushOrders, TRUST } from "../web/src/data.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, "data", "processed");
const OUT = path.join(ROOT, "docs", "results", "scenarios_eval.jsonl");
const DEFAULT = TRUST[2].cfg;

function args() {
  const a = { limit: 400, workers: Math.min(4, os.cpus().length - 1) };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) a[v[i].replace(/^--/, "")] = +v[i + 1];
  return a;
}

function npyDataOffset(fd) {
  const h = Buffer.alloc(12);
  fs.readSync(fd, h, 0, 12, 0);
  return h[6] === 1 ? 10 + h.readUInt16LE(8) : 12 + h.readUInt32LE(8);
}
function readF32(fd, base, off, count) {
  const buf = Buffer.alloc(count * 4);
  fs.readSync(fd, buf, 0, count * 4, base + off * 4);
  return new Float32Array(buf.buffer, buf.byteOffset, count);
}
const f64 = (a, fill) => Float64Array.from(a, (x) => (x == null ? fill : x));

function metrics(tour, r) {
  const s = simulate(tour, r.T, r.n, r.service, r.twStart, r.twEnd);
  return { travel: Math.round(tourCost(tour, r.T, r.n)), duration: Math.round(s.duration), lateStops: s.lateStops,
           reentries: zoneReentries(tour, r.zone, r.n) };
}

function solveAll(r) {
  // same fixed round counts as the website (web/src/worker.js)
  const base = { n: r.n, T: r.T, service: r.service, twStart: r.twStart, twEnd: r.twEnd, timeLimitMs: 4000, seed: 1 };
  const lot = solveRoute({ ...base, maxIters: 280, C: habitCosts(r.T, r.n, r.zone, r.H, r.k, DEFAULT[0], DEFAULT[1]), zone: r.zone });
  const tsp = solveRoute({ ...base, maxIters: 470 });
  return { driver: metrics(r.actual, r), lot: metrics(lot.tour, r), tsp: metrics(tsp.tour, r) };
}

function runWorker() {
  const bench = JSON.parse(fs.readFileSync(path.join(P, "bench_eval.json"), "utf8"));
  const byId = new Map(bench.routes.map((r) => [r.id, r]));
  const ttFd = fs.openSync(path.join(P, "tt_eval.npy"), "r");
  const ttBase = npyDataOffset(ttFd);
  const hFd = fs.openSync(path.join(P, "habit_eval.bin"), "r");
  for (const id of workerData.ids) {
    const m = byId.get(id);
    const r = {
      ...m, T: readF32(ttFd, ttBase, m.tt, m.n * m.n), H: readF32(hFd, 0, m.h, m.k * m.k),
      zone: Int32Array.from(m.zone), service: f64(m.service, 0), twStart: f64(m.twStart, -Infinity),
      twEnd: f64(m.twEnd, Infinity), actual: Int32Array.from(m.actual),
    };
    parentPort.postMessage({
      id, station: m.station, n: m.n,
      base: solveAll(r), late: solveAll(lateStart(r, 45)), rush: solveAll(rushOrders(r, 8, 4)),
    });
  }
  parentPort.postMessage(null);
}

async function main() {
  const a = args();
  const bench = JSON.parse(fs.readFileSync(path.join(P, "bench_eval.json"), "utf8"));
  const all = bench.routes.map((r) => r.id);
  const step = Math.max(1, Math.floor(all.length / a.limit));
  const ids = all.filter((_, i) => i % step === 0).slice(0, a.limit);
  const out = fs.createWriteStream(OUT);
  let done = 0, alive = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    for (let w = 0; w < a.workers; w++) {
      const chunk = ids.filter((_, i) => i % a.workers === w);
      if (!chunk.length) continue;
      alive++;
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { ids: chunk } });
      wk.on("message", (msg) => {
        if (msg === null) { if (--alive === 0) resolve(); return; }
        out.write(JSON.stringify(msg) + "\n");
        if (++done % 50 === 0) console.log(`${done}/${ids.length} routes, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      });
      wk.on("error", (e) => { console.error(e); process.exit(1); });
    }
  });
  out.end();
  console.log(`done: ${done} routes -> ${OUT}`);
}

if (isMainThread) main(); else runWorker();
