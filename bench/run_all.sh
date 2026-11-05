#!/bin/sh
# Reproduce every result in docs/results from the processed data, 4 threads at a time.
# Prerequisites: pipeline/download.py, ingest.py, zone_model.py, export_bench.py (see README).
# Usage: sh bench/run_all.sh [first stage, 1 to 5]   e.g. "sh bench/run_all.sh 2" skips the held-out benchmark
set -e
cd "$(dirname "$0")/.."
FROM="${1:-1}"

# 1. Held-out benchmark: all 3,052 evaluation routes, every method (about 25 minutes)
if [ "$FROM" -le 1 ]; then
  node bench/run.mjs --split eval --ms 300 --workers 4 \
    --weights 0:600,30:300,60:600,120:1200,300:1200 --out docs/results/bench_eval.jsonl
fi

# 2. Scenario analysis on 400 held-out routes (late start, rush orders)
if [ "$FROM" -le 2 ]; then node bench/scenarios.mjs --limit 400 --workers 4; fi

# 3. Training routes, for the check against Amazon's route-quality labels
if [ "$FROM" -le 3 ]; then
  node bench/run.mjs --split train --ms 200 --workers 4 --weights 30:300 --out docs/results/bench_train.jsonl
fi

# 4. Solver-quality check against Google OR-Tools on 200 held-out routes, both on travel time alone
if [ "$FROM" -le 4 ]; then
  .venv/bin/python pipeline/ortools_baseline.py --limit 200 --seconds 5 --workers 4
  node bench/run.mjs --split eval --limit 200 --ms 300 --workers 4 --weights "" --windows 0 --out docs/results/tsp_nowin_eval.jsonl
fi

# 5. Website data, summary numbers, README and report
.venv/bin/python pipeline/export_web.py
.venv/bin/python pipeline/write_docs.py
