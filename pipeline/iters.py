"""Median search rounds the benchmark's time budget reached, per method. The website runs a fixed
number of rounds (web/src/worker.js maxIters) so that the same route always gives the same answer;
this is where that number comes from."""
import json
import pathlib

import numpy as np

R = pathlib.Path(__file__).resolve().parent.parent / "docs" / "results" / "bench_eval.jsonl"
rows = [json.loads(line) for line in R.read_text().splitlines() if line.strip()]
for k in rows[0]["m"]:
    it = [r["m"][k]["iters"] for r in rows if "iters" in r["m"][k]]
    if it:
        print(f"{k:16s} median {np.median(it):6.0f}   p10 {np.percentile(it, 10):6.0f}   p90 {np.percentile(it, 90):6.0f}")
