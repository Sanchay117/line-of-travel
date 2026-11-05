"""Summarise a benchmark JSONL: per method, mean drive time vs the driver, Amazon score, lateness."""
import json
import pathlib
import sys

import numpy as np
import pandas as pd

path = pathlib.Path(sys.argv[1])
rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
recs = []
for r in rows:
    d = r["m"]["driver"]
    for name, m in r["m"].items():
        recs.append(dict(id=r["id"], method=name, n=r["n"], windows=r["windows"],
                         travel=m["travel"], d_travel=d["travel"], duration=m["duration"],
                         lateStops=m["lateStops"], late=m["late"], reentries=m["reentries"], score=m["score"],
                         ms=m.get("ms", np.nan)))
df = pd.DataFrame(recs)
df["saving_pct"] = 100 * (df.d_travel - df.travel) / df.d_travel
g = df.groupby("method", sort=False)
out = pd.DataFrame({
    "routes": g.id.count(),
    "drive_h_total": g.travel.sum() / 3600,
    "saving_vs_driver_%": 100 * (g.d_travel.sum() - g.travel.sum()) / g.d_travel.sum(),
    "median_route_saving_%": g.saving_pct.median(),
    "amazon_score": g.score.mean(),
    "late_stops": g.lateStops.sum(),
    "zone_reentries/route": g.reentries.mean(),
    "solve_ms": g.ms.mean(),
})
pd.set_option("display.width", 200)
print(out.round(4).to_string())
print(f"\nroutes with any time window: {(df[df.method=='driver'].windows > 0).mean():.1%}; "
      f"stops with windows: {df[df.method=='driver'].windows.sum()} of {df[df.method=='driver'].n.sum()}")
