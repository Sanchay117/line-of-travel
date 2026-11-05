// Route sequencing engine. Plain JavaScript, no dependencies: the Node benchmark and the
// browser demo import this same file, so the numbers in the report are the numbers on screen.
//
// Problem: one van leaves the station (index 0), visits every stop once and returns.
// Travel times are asymmetric (Amazon's matrices). Some stops carry delivery time windows.
// Objective:  sum of edge costs  +  lateWeight * seconds of lateness
// where edge cost = travel time + habit cost (learned from drivers, see pipeline/zone_model.py).
//
// Method: nearest-neighbour start, then iterated local search
//   local search  = asymmetric 2-opt (O(1) delta with prefix sums) + or-opt (segments of 1-3,
//                   both orientations) + zone-block moves, first improvement until no move helps
//   perturbation  = double bridge (orientation-preserving segment swap), half of them cut at
//                   zone boundaries
//   acceptance    = edge cost + lateWeight * lateness, from a full schedule simulation
//   time windows  = a repair pass that moves whole zones first, then single stops

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tourCost(t, C, n) {
  let s = 0;
  for (let k = 0; k < n - 1; k++) s += C[t[k] * n + t[k + 1]];
  return s + C[t[n - 1] * n + t[0]];
}

// Schedule a tour: depart at time 0, wait if early, service at each stop.
export function simulate(t, T, n, service, twStart, twEnd) {
  let time = 0, late = 0, lateStops = 0, wait = 0;
  for (let k = 1; k < n; k++) {
    time += T[t[k - 1] * n + t[k]];
    const s = t[k];
    if (twStart && time < twStart[s]) { wait += twStart[s] - time; time = twStart[s]; }
    if (twEnd && time > twEnd[s]) { late += time - twEnd[s]; lateStops++; }
    if (service) time += service[s];
  }
  time += T[t[n - 1] * n + t[0]];
  return { duration: time, late, lateStops, wait };
}

export function nearestNeighbour(C, n) {
  const t = new Int32Array(n);
  const used = new Uint8Array(n);
  used[0] = 1;
  for (let k = 1; k < n; k++) {
    const a = t[k - 1];
    let best = -1, bc = Infinity;
    for (let b = 1; b < n; b++) {
      if (!used[b] && C[a * n + b] < bc) { bc = C[a * n + b]; best = b; }
    }
    t[k] = best;
    used[best] = 1;
  }
  return t;
}

// Runs of consecutive stops in the same zone: returns their start positions (position 0 is the station).
function blockStarts(t, n, zone) {
  const s = [];
  for (let k = 1; k < n; k++) if (k === 1 || zone[t[k]] !== zone[t[k - 1]]) s.push(k);
  return s;
}

// Asymmetric 2-opt + or-opt, first improvement. Mutates t. Returns final cost.
// With `zone`, also tries zone-block moves: lift a whole run of same-zone stops and put it
// between two other runs, either way round. Single-stop moves cannot reorder zones once
// leaving a zone is expensive, so without this the zone order gets stuck.
export function localSearch(t, C, n, zone) {
  const F = new Float64Array(n + 1);
  const B = new Float64Array(n + 1);
  const eps = 1e-7;
  const prefix = () => {
    F[0] = 0; B[0] = 0;
    for (let k = 0; k < n - 1; k++) {
      F[k + 1] = F[k] + C[t[k] * n + t[k + 1]];
      B[k + 1] = B[k] + C[t[k + 1] * n + t[k]];
    }
  };
  let improved = true;
  while (improved) {
    improved = false;
    // ---- 2-opt: reverse t[i+1..j]
    prefix();
    outer2: for (let i = 0; i < n - 2; i++) {
      const a = t[i], a1 = t[i + 1];
      for (let j = i + 2; j < n; j++) {
        const b = t[j], b1 = j + 1 < n ? t[j + 1] : t[0];
        const fwd = F[j] - F[i + 1];
        const rev = B[j] - B[i + 1];
        const delta = C[a * n + b] + C[a1 * n + b1] - C[a * n + a1] - C[b * n + b1] + rev - fwd;
        if (delta < -eps) {
          for (let l = i + 1, r = j; l < r; l++, r--) { const x = t[l]; t[l] = t[r]; t[r] = x; }
          improved = true;
          prefix();
          continue outer2;
        }
      }
    }
    // ---- or-opt: move segment t[i..i+L-1] between t[p] and t[p+1], optionally reversed
    for (let L = 1; L <= 3; L++) {
      for (let i = 1; i + L - 1 < n; i++) {
        const e = i + L - 1;
        const prev = t[i - 1], next = e + 1 < n ? t[e + 1] : t[0];
        const s0 = t[i], s1 = t[e];
        let inner = 0, innerRev = 0;
        for (let k = i; k < e; k++) { inner += C[t[k] * n + t[k + 1]]; innerRev += C[t[k + 1] * n + t[k]]; }
        const removeGain = C[prev * n + s0] + C[s1 * n + next] - C[prev * n + next];
        let bestDelta = -eps, bestP = -1, bestRev = false;
        for (let p = 0; p < n; p++) {
          if (p >= i - 1 && p <= e) continue;
          const x = t[p], y = p + 1 < n ? t[p + 1] : t[0];
          const base = -C[x * n + y] - removeGain;
          const dF = base + C[x * n + s0] + C[s1 * n + y];
          if (dF < bestDelta) { bestDelta = dF; bestP = p; bestRev = false; }
          if (L > 1) {
            const dR = base + C[x * n + s1] + C[s0 * n + y] + innerRev - inner;
            if (dR < bestDelta) { bestDelta = dR; bestP = p; bestRev = true; }
          }
        }
        if (bestP >= 0) {
          moveSegment(t, n, i, e, bestP, bestRev);
          improved = true;
        }
      }
    }
    // ---- zone blocks: move a whole same-zone run to another run boundary, optionally reversed
    if (zone && !improved) {
      prefix();
      const st = blockStarts(t, n, zone);
      const nb = st.length;
      for (let bi = 0; bi < nb && !improved; bi++) {
        const i = st[bi], e = (bi + 1 < nb ? st[bi + 1] : n) - 1;
        if (e - i < 3) continue; // short runs are already covered by or-opt
        const prev = t[i - 1], next = e + 1 < n ? t[e + 1] : t[0];
        const s0 = t[i], s1 = t[e];
        const inner = F[e] - F[i], innerRev = B[e] - B[i];
        const removeGain = C[prev * n + s0] + C[s1 * n + next] - C[prev * n + next];
        let bestDelta = -eps, bestP = -1, bestRev = false;
        for (let bj = 0; bj <= nb; bj++) {
          const p = bj < nb ? st[bj] - 1 : n - 1;
          if (p >= i - 1 && p <= e) continue;
          const x = t[p], y = p + 1 < n ? t[p + 1] : t[0];
          const base = -C[x * n + y] - removeGain;
          const dF = base + C[x * n + s0] + C[s1 * n + y];
          if (dF < bestDelta) { bestDelta = dF; bestP = p; bestRev = false; }
          const dR = base + C[x * n + s1] + C[s0 * n + y] + innerRev - inner;
          if (dR < bestDelta) { bestDelta = dR; bestP = p; bestRev = true; }
        }
        if (bestP >= 0) { moveSegment(t, n, i, e, bestP, bestRev); improved = true; }
      }
    }
  }
  return tourCost(t, C, n);
}

// Move t[i..e] to sit after position p (p outside [i-1, e]); position 0 stays the station.
export function moveSegment(t, n, i, e, p, reversed) {
  const seg = Array.from(t.subarray(i, e + 1));
  if (reversed) seg.reverse();
  const rest = [];
  for (let k = 0; k < n; k++) if (k < i || k > e) rest.push(t[k]);
  const at = p < i ? p + 1 : p - seg.length + 1;
  rest.splice(at, 0, ...seg);
  for (let k = 0; k < n; k++) t[k] = rest[k];
}

// With `zone`, half the kicks cut only at zone boundaries, which swaps two runs of whole zones.
function doubleBridge(t, n, rnd, zone) {
  if (n < 8) return Int32Array.from(t);
  const cuts = new Set();
  const st = zone && rnd() < 0.5 ? blockStarts(t, n, zone).slice(1) : null;
  if (st && st.length >= 3) while (cuts.size < 3) cuts.add(st[Math.floor(rnd() * st.length)]);
  else while (cuts.size < 3) cuts.add(1 + Math.floor(rnd() * (n - 1)));
  const [a, b, c] = [...cuts].sort((x, y) => x - y);
  const out = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < a; i++) out[k++] = t[i];
  for (let i = b; i < c; i++) out[k++] = t[i];
  for (let i = a; i < b; i++) out[k++] = t[i];
  for (let i = c; i < n; i++) out[k++] = t[i];
  return out;
}

// Repair for time windows: objective = edge cost + lateWeight * lateness (full simulation).
// With `zone`, first try moving whole zones earlier or later, which keeps every zone in one
// visit; only then move single stops, which may split a zone to save a late delivery.
function repairWindows(t, C, T, n, service, twStart, twEnd, lateWeight, zone) {
  const obj = (x) => tourCost(x, C, n) + lateWeight * simulate(x, T, n, service, twStart, twEnd).late;
  let cur = obj(t);
  let improved = true, rounds = 0;
  const trial = new Int32Array(n);
  while (zone && improved && rounds++ < 20) {
    improved = false;
    const st = blockStarts(t, n, zone);
    const nb = st.length;
    let best = cur - 1e-6, bi0 = -1, bp = -1, brev = false;
    for (let bi = 0; bi < nb; bi++) {
      const i = st[bi], e = (bi + 1 < nb ? st[bi + 1] : n) - 1;
      for (let bj = 0; bj <= nb; bj++) {
        const p = bj < nb ? st[bj] - 1 : n - 1;
        if (p >= i - 1 && p <= e) continue;
        for (const rev of [false, true]) {
          trial.set(t);
          moveSegment(trial, n, i, e, p, rev);
          const v = obj(trial);
          if (v < best) { best = v; bi0 = bi; bp = p; brev = rev; }
        }
      }
    }
    if (bi0 >= 0) {
      const i = st[bi0], e = (bi0 + 1 < nb ? st[bi0 + 1] : n) - 1;
      moveSegment(t, n, i, e, bp, brev);
      cur = best;
      improved = true;
    }
  }
  improved = true; rounds = 0;
  while (improved && rounds++ < 20) {
    improved = false;
    for (let i = 1; i < n; i++) {
      for (let p = 0; p < n; p++) {
        if (p === i || p === i - 1) continue;
        trial.set(t);
        moveSegment(trial, n, i, i, p, false);
        const v = obj(trial);
        if (v < cur - 1e-6) { t.set(trial); cur = v; improved = true; }
      }
    }
  }
  return cur;
}

export function hasWindows(twEnd, n) {
  if (!twEnd) return false;
  for (let k = 1; k < n; k++) if (Number.isFinite(twEnd[k])) return true;
  return false;
}

/**
 * Solve one route.
 * @param {object} o
 * @param {number} o.n            stops including the station at index 0
 * @param {Float32Array} o.T      travel seconds, row-major n*n
 * @param {Float32Array} [o.C]    edge cost used for optimisation (defaults to T)
 * @param {Float64Array} [o.service] service seconds per stop
 * @param {Float64Array} [o.twStart] earliest arrival (seconds after departure), -Infinity if none
 * @param {Float64Array} [o.twEnd]   latest arrival, Infinity if none
 * @param {number} [o.lateWeight] cost per second late (default 20)
 * @param {number} [o.timeLimitMs] ILS budget (default 200)
 * @param {number} [o.maxIters]   stop after this many ILS rounds (repeatable results)
 * @param {number} [o.seed]
 * @param {Int32Array} [o.init]   starting tour (index 0 must be the station)
 * @param {Int32Array} [o.zone]   zone index per stop: turns on zone-block moves, kicks and repair
 * @param {boolean} [o.acceptLate] count lateness when accepting search rounds (default true)
 */
export function solveRoute(o) {
  const { n, T } = o;
  const C = o.C || T;
  const rnd = mulberry32(o.seed ?? 1);
  const budget = o.timeLimitMs ?? 200;
  const lateWeight = o.lateWeight ?? 20;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const t0 = now();

  const zone = o.zone; // optional zone index per stop: enables zone-block moves and kicks
  // Local search works on edge cost alone; acceptance also counts lateness when the route has
  // time windows, so the search keeps tours that are both short and on time.
  // (acceptLate: false reproduces the first engine, which judged tours on edge cost alone.)
  const windows = hasWindows(o.twEnd, n);
  const acceptLate = windows && o.acceptLate !== false;
  const objective = (tour, c) => (acceptLate ? c + lateWeight * simulate(tour, T, n, o.service, o.twStart, o.twEnd).late : c);
  let cur = o.init ? Int32Array.from(o.init) : nearestNeighbour(C, n);
  let curObj = objective(cur, localSearch(cur, C, n, zone));
  let best = Int32Array.from(cur), bestObj = curObj;
  let iters = 0;
  const maxIters = o.maxIters ?? Infinity; // fixed iteration count makes results repeatable
  while (iters < maxIters && now() - t0 < budget && n > 7) {
    const cand = doubleBridge(cur, n, rnd, zone);
    const v = objective(cand, localSearch(cand, C, n, zone));
    iters++;
    if (v < curObj - 1e-9) { cur = cand; curObj = v; }
    if (v < bestObj - 1e-9) { best = Int32Array.from(cand); bestObj = v; }
  }
  if (windows) {
    const s = simulate(best, T, n, o.service, o.twStart, o.twEnd);
    if (s.late > 0) repairWindows(best, C, T, n, o.service, o.twStart, o.twEnd, lateWeight, zone);
  }
  return { tour: best, cost: tourCost(best, C, n), iters, ms: now() - t0 };
}

// Habit-aware edge costs. For an edge that leaves zone a for zone b:
//   C = T + crossing + weight * habit(a -> b)
// `habit` is -log p(next zone | current zone) from the learned model; `crossing` is a flat
// charge for changing zone, which keeps zones contiguous the way drivers work them.
// Edges inside a zone cost only their travel time.
export function habitCosts(T, n, zoneIdx, habit, k, weight, crossing = 0) {
  const C = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const zi = zoneIdx[i];
    for (let j = 0; j < n; j++) {
      const zj = zoneIdx[j];
      C[i * n + j] = T[i * n + j] + (zi === zj ? 0 : crossing + weight * habit[zi * k + zj]);
    }
  }
  return C;
}

// How many times the van enters a zone it has already left (drivers almost never do this).
export function zoneReentries(t, zoneIdx, n) {
  const seen = new Set();
  let re = 0, prev = -1;
  for (let k = 1; k < n; k++) {
    const z = zoneIdx[t[k]];
    if (z !== prev) { if (seen.has(z)) re++; seen.add(z); prev = z; }
  }
  return re;
}
