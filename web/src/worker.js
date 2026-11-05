// Runs the routing engine off the main thread so the map stays responsive.
import { solveRoute, simulate, habitCosts, zoneReentries, tourCost } from "./engine/solver.js";
import { routeScore, normalizeMatrix } from "./engine/score.js";

function evaluate(tour, r, norm, refTour) {
  const s = simulate(tour, r.T, r.n, r.service, r.twStart, r.twEnd);
  return {
    travel: tourCost(tour, r.T, r.n),
    duration: s.duration,
    lateStops: s.lateStops,
    reentries: zoneReentries(tour, r.zone, r.n),
    score: routeScore(Array.from(refTour), Array.from(tour), r.T, r.n, norm),
  };
}

self.onmessage = (e) => {
  const { job, r, cfg, ms, seed, scoreRef } = e.data;
  // Amazon score is always measured against the driver's real order (scoreRef);
  // for added stops it is measured against the dispatcher's version of that order.
  const ref = scoreRef || r.actual;
  const norm = normalizeMatrix(r.T, r.n);
  // A fixed number of search rounds, the median a 300 ms budget reaches in the benchmark
  // (pipeline/iters.py: 279 for the default setting, 466 for shortest path), so the same route
  // and setting always give the same answer. The time cap is only a safety net.
  const base = { n: r.n, T: r.T, service: r.service, twStart: r.twStart, twEnd: r.twEnd, timeLimitMs: 4000, maxIters: cfg ? 280 : 470, seed };
  const C = cfg ? habitCosts(r.T, r.n, r.zone, r.H, r.k, cfg[0], cfg[1]) : undefined;
  const sol = solveRoute({ ...base, C, zone: cfg ? r.zone : undefined });
  const out = { job, tour: sol.tour, ms: sol.ms, iters: sol.iters, m: evaluate(sol.tour, r, norm, ref) };
  if (e.data.withDriver) out.driver = evaluate(r.actual, r, norm, ref);
  self.postMessage(out, [sol.tour.buffer]);
};
