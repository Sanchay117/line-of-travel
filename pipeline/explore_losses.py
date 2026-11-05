"""Where does Line of Travel lose to the driver? Tail analysis of the held-out benchmark."""
import json
import pathlib

import pandas as pd

R = pathlib.Path(__file__).resolve().parent.parent / "docs" / "results"
rows = [json.loads(l) for l in (R / "bench_eval.jsonl").read_text().splitlines() if l.strip()]
recs = []
for r in rows:
    d = r["m"]["driver"]
    rec = dict(id=r["id"], station=r["station"], n=r["n"], drv_re=d["reentries"], drv_travel=d["travel"])
    for k in ["tsp", "habit_0_600", "habit_30_300", "habit_300_1200"]:
        rec[k] = 100 * (d["travel"] - r["m"][k]["travel"]) / d["travel"]
    recs.append(rec)
df = pd.DataFrame(recs)
for k in ["tsp", "habit_0_600", "habit_30_300", "habit_300_1200"]:
    print(f"{k:16s} share of routes worse than driver: {(df[k] < 0).mean():.1%}   worse by >4%: {(df[k] < -4).mean():.1%}")
df["loses"] = df.habit_30_300 < -4
print("\nby driver zone re-entries (default setting):")
df["re_bin"] = pd.cut(df.drv_re, [-1, 0, 1, 3, 6, 100], labels=["0", "1", "2-3", "4-6", "7+"])
print(df.groupby("re_bin", observed=True).agg(routes=("id", "count"), loses=("loses", "mean"),
      lot_saving=("habit_30_300", "median"), tsp_saving=("tsp", "median")).round(3).to_string())
print("\nby station (default setting):")
print(df.groupby("station").agg(routes=("id", "count"), loses=("loses", "mean"), lot_med=("habit_30_300", "median"),
      tsp_med=("tsp", "median"), drv_re=("drv_re", "mean")).sort_values("loses").round(3).to_string())
