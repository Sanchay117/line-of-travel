// Benchmark the routing engine on Amazon's held-out evaluation routes (or the training routes).
// Usage: node bench/run.mjs --split eval --limit 0 --ms 300 --weights 60:600,120:600 --out docs/results/bench_eval.jsonl
// Each weight is "habitWeight:crossingSeconds" (see habitCosts in the engine).
// --engine v1 reproduces the first engine for the ablation in docs/results/v1: no zone-block
// moves, and search rounds judged on edge cost alone (lateness only fixed by the final repair).
// Every route is solved by each method; results stream to a JSONL file, one line per route.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { solveRoute, simulate, habitCosts, zoneReentries, nearestNeighbour, tourCost } from "../web/src/engine/solver.js";
import { routeScore, normalizeMatrix } from "../web/src/engine/score.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, "data", "processed");

function args() {
  const a = { split: "eval", limit: 0, ms: 300, weights: "60,180,600", out: "", workers: Math.max(1, os.cpus().length - 1), seed: 1 };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) a[v[i].replace(/^--/, "")] = v[i + 1];
  a.limit = +a.limit; a.ms = +a.ms; a.workers = +a.workers; a.seed = +a.seed;
  a.weights = String(a.weights).split(",").filter(Boolean).map((s) => s.split(":").map(Number));
  a.out = a.out || path.join(ROOT, "docs", "results", `bench_${a.split}.jsonl`);
  return a;
}

function npyDataOffset(fd) {
  const h = Buffer.alloc(12);
  fs.readSync(fd, h, 0, 12, 0);
  const major = h[6];
  return major === 1 ? 10 + h.readUInt16LE(8) : 12 + h.readUInt32LE(8);
}

function readF32(fd, base, offsetFloats, count) {
  const buf = Buffer.alloc(count * 4);
  fs.readSync(fd, buf, 0, count * 4, base + offsetFloats * 4);
  return new Float32Array(buf.buffer, buf.byteOffset, count);
}

function toF64(arr, fill) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] == null ? fill : arr[i];
  return out;
}

function evaluate(tour, ctx) {
  const { T, n, service, twStart, twEnd, zone, actual, norm } = ctx;
  const s = simulate(tour, T, n, service, twStart, twEnd);
  return {
    travel: Math.round(tourCost(tour, T, n)),
    duration: Math.round(s.duration),
    late: Math.round(s.late),
    lateStops: s.lateStops,
    reentries: zoneReentries(tour, zone, n),
    score: +routeScore(actual, Array.from(tour), T, n, norm).toFixed(5),
  };
}

function runWorker() {
  const { split, ids, ms, weights, seed, engine } = workerData;
  const v1 = engine === "v1";
  const bench = JSON.parse(fs.readFileSync(path.join(P, `bench_${split}.json`), "utf8"));
  const byId = new Map(bench.routes.map((r) => [r.id, r]));
  const ttFd = fs.openSync(path.join(P, `tt_${split}.npy`), "r");
  const ttBase = npyDataOffset(ttFd);
  const hFd = fs.openSync(path.join(P, `habit_${split}.bin`), "r");
  for (const id of ids) {
    const r = byId.get(id);
    const n = r.n;
    const T = readF32(ttFd, ttBase, r.tt, n * n);
    const H = readF32(hFd, 0, r.h, r.k * r.k);
    const ctx = {
      T, n, zone: Int32Array.from(r.zone), actual: r.actual, norm: normalizeMatrix(T, n),
      service: toF64(r.service, 0), twStart: toF64(r.twStart, -Infinity), twEnd: toF64(r.twEnd, Infinity),
    };
    const res = { id, station: r.station, quality: r.quality, n, windows: r.twEnd.filter((x) => x != null).length, m: {} };
    res.m.driver = evaluate(Int32Array.from(r.actual), ctx);
    const nn = nearestNeighbour(T, n);
    res.m.nearest = evaluate(nn, ctx);
    // --windows 0 solves on travel time alone (for the like-for-like check against OR-Tools)
    const tw = workerData.windows ? { service: ctx.service, twStart: ctx.twStart, twEnd: ctx.twEnd } : {};
    const base = { n, T, ...tw, timeLimitMs: ms, seed, acceptLate: !v1 };
    const tsp = solveRoute(base);
    res.m.tsp = { ...evaluate(tsp.tour, ctx), ms: Math.round(tsp.ms), iters: tsp.iters };
    for (const [w, x = 0] of weights) {
      const C = habitCosts(T, n, ctx.zone, H, r.k, w, x);
      const sol = solveRoute({ ...base, C, zone: v1 ? undefined : ctx.zone });
      res.m[`habit_${w}_${x}`] = { ...evaluate(sol.tour, ctx), ms: Math.round(sol.ms), iters: sol.iters };
    }
    parentPort.postMessage(res);
  }
  parentPort.postMessage(null);
}

async function main() {
  const a = args();
  const bench = JSON.parse(fs.readFileSync(path.join(P, `bench_${a.split}.json`), "utf8"));
  let ids = bench.routes.map((r) => r.id);
  if (a.limit > 0) {
    // deterministic spread across stations: every k-th route
    const step = Math.max(1, Math.floor(ids.length / a.limit));
    ids = ids.filter((_, i) => i % step === 0).slice(0, a.limit);
  }
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  // --resume 1: keep finished routes already in the output file and solve only the rest.
  let flags = "w";
  if (a.resume === "1" && fs.existsSync(a.out)) {
    const lines = fs.readFileSync(a.out, "utf8").split("\n");
    const good = [];
    for (const l of lines) { try { good.push(JSON.parse(l)); } catch { /* drop a torn last line */ } }
    fs.writeFileSync(a.out, good.map((g) => JSON.stringify(g) + "\n").join(""));
    const seen = new Set(good.map((g) => g.id));
    ids = ids.filter((id) => !seen.has(id));
    flags = "a";
    console.log(`resuming: ${seen.size} done, ${ids.length} to go`);
  }
  const out = fs.createWriteStream(a.out, { flags });
  const chunks = Array.from({ length: a.workers }, (_, w) => ids.filter((_, i) => i % a.workers === w));
  let done = 0, alive = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    for (const chunk of chunks) {
      if (!chunk.length) continue;
      alive++;
      const w = new Worker(fileURLToPath(import.meta.url), {
        workerData: { split: a.split, ids: chunk, ms: a.ms, weights: a.weights, seed: a.seed, engine: a.engine || "v2", windows: a.windows !== "0" },
      });
      w.on("message", (m) => {
        if (m === null) { if (--alive === 0) resolve(); return; }
        out.write(JSON.stringify(m) + "\n");
        if (++done % 100 === 0) console.log(`${done}/${ids.length} routes, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      });
      w.on("error", (e) => { console.error(e); process.exit(1); });
    }
  });
  out.end();
  console.log(`done: ${done} routes in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${a.out}`);
}

if (isMainThread) main(); else runWorker();
