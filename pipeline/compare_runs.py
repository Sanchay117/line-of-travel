"""Compare two benchmark files on the routes they share: drive time saved, score, re-entries, losses.
Usage: python pipeline/compare_runs.py OLD.jsonl NEW.jsonl [method ...]
"""
import json
import sys

import numpy as np


def load(p):
    out = {}
    for line in open(p):
        if line.strip():
            r = json.loads(line)
            out[r["id"]] = r
    return out


old, new = load(sys.argv[1]), load(sys.argv[2])
methods = sys.argv[3:] or ["habit_0_600", "habit_30_300"]
ids = sorted(set(old) & set(new))
print(f"{len(ids)} shared routes")
for m in methods:
    for name, src in [("old", old), ("new", new)]:
        rs = [src[i] for i in ids if m in src[i]["m"]]
        drv = np.array([r["m"]["driver"]["travel"] for r in rs], float)
        tr = np.array([r["m"][m]["travel"] for r in rs], float)
        per = 100 * (drv - tr) / drv
        sc = np.mean([r["m"][m]["score"] for r in rs])
        re = np.mean([r["m"][m]["reentries"] for r in rs])
        late = sum(r["m"][m]["lateStops"] for r in rs)
        print(f"{m:14s} {name}: saved {100 * (drv.sum() - tr.sum()) / drv.sum():5.2f}%  median {np.median(per):5.2f}%  "
              f"worse {np.mean(per < 0):5.1%}  worse>4% {np.mean(per < -4):5.1%}  score {sc:.4f}  re {re:.2f}  late {late}")
