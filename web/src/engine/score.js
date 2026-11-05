// Amazon Last Mile Routing Research Challenge route score (lower = closer to the driver).
// Same algorithm as pipeline/scoring.py, which is tested against the official MIT-CAVE scorer.
// Tours here are stop-index arrays that start at the station (index 0); the closing return
// to the station is appended, as the official route2list does.

const GAP = 1000;

export function normalizeMatrix(T, n) {
  let sum = 0;
  for (let i = 0; i < n * n; i++) sum += T[i];
  const mean = sum / (n * n);
  let sq = 0;
  for (let i = 0; i < n * n; i++) sq += (T[i] - mean) ** 2;
  const std = Math.sqrt(sq / (n * n));
  const out = new Float64Array(n * n);
  let min = Infinity;
  for (let i = 0; i < n * n; i++) { out[i] = (T[i] - mean) / std; if (out[i] < min) min = out[i]; }
  for (let i = 0; i < n * n; i++) out[i] -= min;
  return out;
}

export function seqDev(actual, sub) {
  const a = actual.slice(1, -1), s = sub.slice(1, -1);
  const pos = new Map(a.map((x, i) => [x, i]));
  let total = 0;
  for (let k = 1; k < s.length; k++) total += Math.abs(pos.get(s[k]) - pos.get(s[k - 1])) - 1;
  const n = a.length;
  return (2 / (n * (n - 1))) * total;
}

export function erpPerEdit(actual, sub, norm, n) {
  const A = actual.length, S = sub.length, W = S + 1;
  const d = new Float64Array((A + 1) * W);
  const c = new Int32Array((A + 1) * W);
  for (let i = A - 1; i >= 0; i--) { d[i * W + S] = d[(i + 1) * W + S] + GAP; c[i * W + S] = A - i; }
  for (let j = S - 1; j >= 0; j--) { d[A * W + j] = d[A * W + j + 1] + GAP; c[A * W + j] = S - j; }
  for (let i = A - 1; i >= 0; i--) {
    const ai = actual[i];
    for (let j = S - 1; j >= 0; j--) {
      const sj = sub[j];
      const o1 = d[(i + 1) * W + j + 1] + norm[ai * n + sj];
      const o2 = d[(i + 1) * W + j] + GAP;
      const o3 = d[i * W + j + 1] + GAP;
      const best = Math.min(o1, o2, o3);
      d[i * W + j] = best;
      if (best === o1) c[i * W + j] = c[(i + 1) * W + j + 1] + (ai === sj ? 0 : 1);
      else if (best === o2) c[i * W + j] = c[(i + 1) * W + j] + 1;
      else c[i * W + j] = c[i * W + j + 1] + 1;
    }
  }
  return c[0] === 0 ? 0 : d[0] / c[0];
}

/** Score a proposed tour against the driver's tour. `norm` may be passed to reuse normalisation. */
export function routeScore(actualTour, proposedTour, T, n, norm) {
  const a = [...actualTour, actualTour[0]];
  const s = [...proposedTour, proposedTour[0]];
  const m = norm || normalizeMatrix(T, n);
  return seqDev(a, s) * erpPerEdit(a, s, m, n);
}
