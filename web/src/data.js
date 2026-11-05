// Loading curated routes and building scenario variants for the browser engine.
import { mulberry32 } from "./engine/solver.js";

const BASE = "./data/";

export const CITY = { DLA: "Los Angeles", DSE: "Seattle", DBO: "Boston", DCH: "Chicago", DAU: "Austin" };
export const cityOf = (station) => CITY[station.slice(0, 3)] || station;

// Trust levels on the desk slider -> [habit weight, zone-crossing seconds]; null = pure travel time.
export const TRUST = [
  { key: "off", label: "off", cfg: null },
  { key: "zones", label: "zones only", cfg: [0, 600] },
  { key: "medium", label: "medium", cfg: [30, 300] },
  { key: "high", label: "high", cfg: [60, 600] },
  { key: "max", label: "maximum", cfg: [300, 1200] },
];

export async function loadIndex() {
  const [routes, summary] = await Promise.all([
    fetch(BASE + "routes.json").then((r) => r.json()),
    fetch(BASE + "summary.json").then((r) => r.json()),
  ]);
  return { routes, summary };
}

const cache = new Map();
export async function loadRoute(meta) {
  if (cache.has(meta.id)) return cache.get(meta.id);
  const buf = await fetch(`${BASE}r/${meta.id}.bin`).then((r) => r.arrayBuffer());
  const n = meta.n, k = meta.k;
  const T = new Float32Array(buf, 0, n * n);
  const H = new Float32Array(buf, n * n * 4, k * k);
  const f64 = (a, fill) => Float64Array.from(a, (x) => (x == null ? fill : x));
  const route = {
    ...meta, T, H,
    zone: Int32Array.from(meta.zone),
    service: f64(meta.service, 0),
    twStart: f64(meta.twStart, -Infinity),
    twEnd: f64(meta.twEnd, Infinity),
    actual: Int32Array.from(meta.actual),
  };
  cache.set(meta.id, route);
  return route;
}

// Scenario: the van leaves the station late. Every window closes that much earlier
// relative to departure; the driver's order is kept as it was.
export function lateStart(route, minutes = 45) {
  const s = minutes * 60;
  return {
    ...route,
    twStart: route.twStart.map((x) => x - s),
    twEnd: route.twEnd.map((x) => x - s),
    scenario: { kind: "late", minutes },
  };
}

// Scenario: same-day orders land after the van was loaded. Each new stop sits ~100 m from an
// existing stop and inherits its zone; its travel times are the neighbour's plus 40 s.
// It must be delivered within `deadlineH` hours of departure. The driver baseline is the
// dispatcher's manual fix: insert each new stop where it adds the least travel time.
export function rushOrders(route, count = 8, deadlineH = 4, seed = 11) {
  const rnd = mulberry32(seed + route.n);
  const n0 = route.n, n = n0 + count;
  const pool = Array.from({ length: n0 - 1 }, (_, i) => i + 1);
  const src = [];
  const usedZones = new Set();
  while (src.length < count && pool.length) {
    const j = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (usedZones.has(route.zone[j]) && pool.length > count) continue;
    usedZones.add(route.zone[j]);
    src.push(j);
  }
  const map = (i) => (i < n0 ? i : src[i - n0]);
  const T = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const base = route.T[map(i) * n0 + map(j)];
      T[i * n + j] = base + (i >= n0 || j >= n0 ? 40 : 0);
    }
  }
  const ext = (arr, f) => { const out = new Float64Array(n); out.set(arr); for (let i = n0; i < n; i++) out[i] = f(i); return out; };
  const lat = [...route.lat], lng = [...route.lng], zone = new Int32Array(n);
  zone.set(route.zone);
  for (let i = n0; i < n; i++) {
    const s = src[i - n0];
    const a = rnd() * Math.PI * 2;
    lat.push(route.lat[s] + 0.0009 * Math.sin(a));
    lng.push(route.lng[s] + 0.0011 * Math.cos(a));
    zone[i] = route.zone[s];
  }
  const twEnd = ext(route.twEnd, () => deadlineH * 3600);
  const twStart = ext(route.twStart, () => -Infinity);
  const service = ext(route.service, () => 90);
  // dispatcher baseline: cheapest insertion into the driver's own order
  let tour = Array.from(route.actual);
  for (let i = n0; i < n; i++) {
    let best = 1, bc = Infinity;
    for (let p = 0; p < tour.length; p++) {
      const a = tour[p], b = p + 1 < tour.length ? tour[p + 1] : tour[0];
      const c = T[a * n + i] + T[i * n + b] - T[a * n + b];
      if (c < bc) { bc = c; best = p + 1; }
    }
    tour.splice(best, 0, i);
  }
  return {
    ...route, n, T, lat, lng, zone, service, twStart, twEnd,
    actual: Int32Array.from(tour), added: src.length,
    scenario: { kind: "rush", count: src.length, deadlineH },
  };
}
