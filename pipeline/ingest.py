"""Turn the raw Amazon JSON into compact, analysis-ready files.

Outputs (data/processed/):
  routes.parquet   one row per route (split, station, date, departure, capacity, quality, stop count)
  stops.parquet    one row per stop (coords, zone, driver's actual position, packages, service time,
                   parcel volume, time window as seconds after departure)
  tt_<split>.bin   float32 travel-time matrices, row-major, concatenated in routes.parquet order
                   (offset and size per route are in routes.parquet: tt_offset, n)

Stop index 0 is always the station; the other stops keep their order from route_data.
Travel times are streamed with ijson so the 1.8 GB file never sits in memory at once.
"""
from __future__ import annotations

import json
import math
import pathlib
import sys
from datetime import datetime, timezone

import ijson
import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

SPLITS = {
    "train": dict(route="route_data.json", seq="actual_sequences.json", pkg="package_data.json",
                  tt="travel_times.json", inv="invalid_sequence_scores.json"),
    "eval": dict(route="eval_route_data.json", seq="eval_actual_sequences.json", pkg="eval_package_data.json",
                 tt="eval_travel_times.json", inv="eval_invalid_sequence_scores.json"),
}


def parse_utc(s: str) -> float:
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()


def is_nan(x) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x))


def ingest(split: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    f = SPLITS[split]
    print(f"[{split}] routes", flush=True)
    routes_raw = json.loads((RAW / f["route"]).read_text())
    seqs = json.loads((RAW / f["seq"]).read_text())
    invalid = json.loads((RAW / f["inv"]).read_text())

    route_rows, stop_rows, order = [], [], {}
    for rid, r in routes_raw.items():
        stops = r["stops"]
        station = [s for s, v in stops.items() if v["type"] == "Station"]
        assert len(station) == 1, rid
        ids = station + [s for s in stops if s != station[0]]
        order[rid] = ids
        dep = parse_utc(f"{r['date_YYYY_MM_DD']} {r['departure_time_utc']}")
        actual = seqs[rid]["actual"]
        route_rows.append(dict(
            route_id=rid, split=split, station_code=r["station_code"], date=r["date_YYYY_MM_DD"],
            departure_utc=dep, capacity_cm3=float(r["executor_capacity_cm3"]),
            route_score=r.get("route_score"), n=len(ids), invalid_score=float(invalid[rid]),
        ))
        for k, s in enumerate(ids):
            v = stops[s]
            zone = v.get("zone_id")
            stop_rows.append(dict(
                route_id=rid, idx=k, stop_id=s, lat=v["lat"], lng=v["lng"], type=v["type"],
                zone_id=None if is_nan(zone) else zone, actual_pos=int(actual[s]),
            ))
    routes = pd.DataFrame(route_rows)
    stops = pd.DataFrame(stop_rows)
    dep_by_route = dict(zip(routes.route_id, routes.departure_utc))

    print(f"[{split}] packages", flush=True)
    pkg_rows = []
    # package_data contains bare NaN literals, which ijson rejects; the stdlib parser accepts them.
    packages = json.loads((RAW / f["pkg"]).read_text())
    for rid, rstops in packages.items():
        dep = dep_by_route[rid]
        for s, pkgs in rstops.items():
            n_pk, svc, vol, delivered = 0, 0.0, 0.0, 0
            tw_s, tw_e = -np.inf, np.inf
            for p in pkgs.values():
                n_pk += 1
                svc += float(p["planned_service_time_seconds"])
                d = p["dimensions"]
                vol += float(d["depth_cm"]) * float(d["height_cm"]) * float(d["width_cm"])
                delivered += p.get("scan_status") == "DELIVERED"
                tw = p.get("time_window") or {}
                st, en = tw.get("start_time_utc"), tw.get("end_time_utc")
                if not is_nan(st) and not is_nan(en):
                    # a stop's window is the intersection of its packages' windows
                    tw_s = max(tw_s, parse_utc(st) - dep)
                    tw_e = min(tw_e, parse_utc(en) - dep)
            pkg_rows.append(dict(route_id=rid, stop_id=s, n_packages=n_pk, service_s=svc,
                                 volume_cm3=vol, n_delivered=delivered,
                                 tw_start=tw_s if np.isfinite(tw_s) else np.nan,
                                 tw_end=tw_e if np.isfinite(tw_e) else np.nan))
    pk = pd.DataFrame(pkg_rows)
    stops = stops.merge(pk, on=["route_id", "stop_id"], how="left")
    for c in ["n_packages", "service_s", "volume_cm3", "n_delivered"]:
        stops[c] = stops[c].fillna(0)

    print(f"[{split}] travel times", flush=True)
    sizes = dict(zip(routes.route_id, routes.n))
    offsets, off = {}, 0
    for rid in routes.route_id:
        offsets[rid] = off
        off += sizes[rid] ** 2
    mm = np.lib.format.open_memmap(OUT / f"tt_{split}.npy", mode="w+", dtype=np.float32, shape=(off,))
    done = 0
    with open(RAW / f["tt"], "rb") as fh:
        for rid, mat in ijson.kvitems(fh, "", use_float=True):
            ids = order[rid]
            n = len(ids)
            idx = {s: i for i, s in enumerate(ids)}
            m = np.empty((n, n), dtype=np.float32)
            for a, row in mat.items():
                ia = idx[a]
                for b, t in row.items():
                    m[ia, idx[b]] = t
            o = offsets[rid]
            mm[o:o + n * n] = m.ravel()
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(routes)}", flush=True)
    mm.flush()
    routes["tt_offset"] = routes.route_id.map(offsets)
    return routes, stops


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    splits = sys.argv[1:] or ["eval", "train"]
    for sp in splits:
        r, s = ingest(sp)
        r.to_parquet(OUT / f"routes_{sp}.parquet", index=False)
        s.to_parquet(OUT / f"stops_{sp}.parquet", index=False)
        print(f"[{sp}] {len(r)} routes, {len(s)} stops", flush=True)
