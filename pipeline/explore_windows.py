"""Time windows, service times, volumes and departure times in the held-out routes."""
import pathlib

import pandas as pd

P = pathlib.Path(__file__).resolve().parent.parent / "data" / "processed"
s = pd.read_parquet(P / "stops_eval.parquet")
r = pd.read_parquet(P / "routes_eval.parquet")
d = s[s.type == "Dropoff"]
w = d.dropna(subset=["tw_end"])
print(f"dropoffs {len(d)}, with window {len(w)} ({len(w)/len(d):.1%})")
print("window length (h):", ((w.tw_end - w.tw_start) / 3600).describe(percentiles=[.1, .5, .9]).round(2).to_dict())
print("window end after departure (h):", (w.tw_end / 3600).describe(percentiles=[.1, .5, .9]).round(2).to_dict())
print("service s per stop:", d.service_s.describe(percentiles=[.5]).round(1).to_dict())
load = d.groupby("route_id").volume_cm3.sum() / r.set_index("route_id").capacity_cm3
print("load factor:", load.describe(percentiles=[.1, .5, .9]).round(2).to_dict())
dep = pd.to_datetime(r.departure_utc, unit="s").dt.hour
print("departure hour UTC:", dep.value_counts().sort_index().to_dict())
