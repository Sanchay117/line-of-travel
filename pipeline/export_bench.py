"""Package processed routes for the JavaScript engine (Node benchmark and browser demo).

Writes data/processed/bench_<split>.json with, per route: size, travel-matrix offset, station,
quality label, the driver's actual tour (stop indices), service seconds, time windows
(seconds after departure; null = none), zone index per stop, and the offset of its k x k
habit-cost matrix inside habit_<split>.bin (float32).
"""
import json
import math
import pathlib
import sys

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"


def clean(x):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), 1)


def export(split: str):
    routes = pd.read_parquet(P / f"routes_{split}.parquet")
    stops = pd.read_parquet(P / f"stops_{split}.parquet")
    zones = pd.read_parquet(P / f"stop_zones_{split}.parquet")
    stops = stops.merge(zones, on=["route_id", "stop_id"], how="left")
    habit = np.load(P / f"zone_costs_{split}.npz")

    out, blobs, off = [], [], 0
    by_route = {rid: g.sort_values("idx") for rid, g in stops.groupby("route_id", sort=False)}
    for r in routes.itertuples(index=False):
        g = by_route[r.route_id]
        zlist = list(habit[r.route_id + "|zones"])
        zidx = {z: i for i, z in enumerate(zlist)}
        H = habit[r.route_id].astype(np.float32)
        k = len(zlist)
        actual = g.sort_values("actual_pos")["idx"].astype(int).tolist()
        out.append(dict(
            id=r.route_id, n=int(r.n), tt=int(r.tt_offset), station=r.station_code, date=r.date,
            quality=r.route_score, cap=float(r.capacity_cm3), k=k, h=off, zones=[str(z) for z in zlist],
            actual=actual,
            zone=[zidx[z] for z in g["zone"]],
            service=[round(float(x), 1) for x in g["service_s"]],
            twStart=[clean(x) for x in g["tw_start"]],
            twEnd=[clean(x) for x in g["tw_end"]],
            vol=[round(float(x)) for x in g["volume_cm3"]],
            lat=[round(float(x), 6) for x in g["lat"]],
            lng=[round(float(x), 6) for x in g["lng"]],
        ))
        blobs.append(H.ravel())
        off += k * k
    np.concatenate(blobs).astype(np.float32).tofile(P / f"habit_{split}.bin")
    (P / f"bench_{split}.json").write_text(json.dumps(dict(split=split, routes=out)))
    print(f"[{split}] {len(out)} routes exported")


if __name__ == "__main__":
    for sp in sys.argv[1:] or ["eval", "train"]:
        export(sp)
