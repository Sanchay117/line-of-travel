"""Reference solutions from Google OR-Tools, to check the in-browser engine's solution quality.

For a deterministic sample of held-out routes, solve the pure travel-time tour (asymmetric TSP,
same Amazon matrix) with OR-Tools routing: PATH_CHEAPEST_ARC start + guided local search.
Writes docs/results/ortools_eval.jsonl: route id, OR-Tools travel seconds, wall time.
Usage: .venv/bin/python pipeline/ortools_baseline.py --limit 300 --seconds 5
"""
import argparse
import concurrent.futures as cf
import json
import pathlib
import time

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
RES = ROOT / "docs" / "results"


def solve(args):
    rid, n, off, seconds = args
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    tt = np.load(P / "tt_eval.npy", mmap_mode="r")
    T = np.asarray(tt[off:off + n * n]).reshape(n, n)
    Ti = np.rint(T * 10).astype(np.int64)  # deciseconds, OR-Tools needs integers
    mgr = pywrapcp.RoutingIndexManager(n, 1, 0)
    routing = pywrapcp.RoutingModel(mgr)
    cb = routing.RegisterTransitCallback(lambda i, j: int(Ti[mgr.IndexToNode(i), mgr.IndexToNode(j)]))
    routing.SetArcCostEvaluatorOfAllVehicles(cb)
    p = pywrapcp.DefaultRoutingSearchParameters()
    p.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    p.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    p.time_limit.FromSeconds(seconds)
    t0 = time.time()
    sol = routing.SolveWithParameters(p)
    idx, tour = routing.Start(0), []
    while not routing.IsEnd(idx):
        tour.append(mgr.IndexToNode(idx))
        idx = sol.Value(routing.NextVar(idx))
    travel = float(sum(T[tour[k], tour[k + 1]] for k in range(n - 1)) + T[tour[-1], tour[0]])
    return dict(id=rid, travel=round(travel), wall_s=round(time.time() - t0, 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--seconds", type=int, default=5)
    ap.add_argument("--workers", type=int, default=10)
    a = ap.parse_args()
    routes = pd.read_parquet(P / "routes_eval.parquet")
    step = max(1, len(routes) // a.limit)
    sample = routes.iloc[::step].head(a.limit)
    jobs = [(r.route_id, int(r.n), int(r.tt_offset), a.seconds) for r in sample.itertuples()]
    RES.mkdir(parents=True, exist_ok=True)
    with open(RES / "ortools_eval.jsonl", "w") as f, cf.ProcessPoolExecutor(a.workers) as pool:
        for k, res in enumerate(pool.map(solve, jobs), 1):
            f.write(json.dumps(res) + "\n")
            if k % 50 == 0:
                print(f"{k}/{len(jobs)}", flush=True)
    print("done")


if __name__ == "__main__":
    main()
