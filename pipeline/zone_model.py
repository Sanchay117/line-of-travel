"""Learn how drivers move between zones, and turn it into a 'habit cost' for the router.

Each Amazon stop carries a planning zone id like 'A-2.2A' (cluster A, block 2, row 2, column A).
Drivers finish a zone before leaving it 96% of the time, and the order they take through zones
follows patterns that pure travel time does not explain. We model

    p(next zone = c | current zone = a, route)

with a gradient-boosted ranker over every candidate zone in the route, using:
  geometry   centroid distance (km), its rank among candidates, ratio to the nearest candidate
  zone ids   same cluster / block, signed and absolute steps in block, row and column
  history    how often drivers at this station went a -> c (and c -> a) on other days
The router's habit cost for an edge between zones is  -log p.  Training uses the official
training routes; history features for a training route only count other dates (no leakage).
All reported accuracy is on the official held-out evaluation routes.

Outputs: data/processed/zone_costs_<split>.npz  (per-route zone list + k x k cost matrix)
         docs/results/zone_model.json            (held-out accuracy vs baselines)
"""
from __future__ import annotations

import collections
import json
import math
import pathlib
import re

import lightgbm as lgb
import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
RES = ROOT / "docs" / "results"
STATION = "__STATION__"
ZRE = re.compile(r"^([A-Z])-(\d+)\.(\d+)([A-Z])$")


def parse_zone(z: str):
    m = ZRE.match(z) if isinstance(z, str) else None
    if not m:
        return None
    return ord(m.group(1)) - 65, int(m.group(2)), int(m.group(3)), ord(m.group(4)) - 65


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def load(split: str):
    rf, sf = (("route_data.json", "actual_sequences.json") if split == "train"
              else ("eval_route_data.json", "eval_actual_sequences.json"))
    routes = json.loads((RAW / rf).read_text())
    seqs = json.loads((RAW / sf).read_text())
    out = {}
    for rid, r in routes.items():
        stops = r["stops"]
        # Stops without a zone inherit the zone of their nearest zoned stop.
        zoned = [(s, v) for s, v in stops.items() if isinstance(v.get("zone_id"), str) and v["type"] != "Station"]
        zone_of = {}
        for s, v in stops.items():
            if v["type"] == "Station":
                zone_of[s] = STATION
            elif isinstance(v.get("zone_id"), str):
                zone_of[s] = v["zone_id"]
            else:
                near = min(zoned, key=lambda kv: (kv[1]["lat"] - v["lat"]) ** 2 + (kv[1]["lng"] - v["lng"]) ** 2)
                zone_of[s] = near[1]["zone_id"]
        pts = collections.defaultdict(list)
        for s, v in stops.items():
            pts[zone_of[s]].append((v["lat"], v["lng"]))
        cent = {z: (np.mean([p[0] for p in ps]), np.mean([p[1] for p in ps])) for z, ps in pts.items()}
        order = [s for s, _ in sorted(seqs[rid]["actual"].items(), key=lambda kv: kv[1])]
        zseq = [zone_of[s] for s in order] + [STATION]
        runs = [z for i, z in enumerate(zseq) if i == 0 or zseq[i - 1] != z]
        out[rid] = dict(station=r["station_code"], date=r["date_YYYY_MM_DD"], quality=r.get("route_score"),
                        zones=sorted(cent), cent=cent, runs=runs, zone_of=zone_of)
    return out


def history_counts(routes: dict, exclude_date: str | None = None):
    """(station, a, c) -> number of observed a -> c moves."""
    cnt = collections.Counter()
    for r in routes.values():
        if exclude_date is not None and r["date"] == exclude_date:
            continue
        for a, c in zip(r["runs"], r["runs"][1:]):
            cnt[(r["station"], a, c)] += 1
    return cnt


def features(r: dict, a: str, cands: list[str], hist: collections.Counter, hist_from: collections.Counter):
    ca = r["cent"][a]
    d = np.array([haversine_km(ca, r["cent"][c]) for c in cands])
    dmin = max(d.min(), 1e-3)
    rank = d.argsort().argsort() / max(len(cands) - 1, 1)
    pa = parse_zone(a)
    rows = []
    st = r["station"]
    out_total = hist_from[(st, a)]
    for k, c in enumerate(cands):
        pc = parse_zone(c)
        f = dict(dist_km=d[k], dist_rank=rank[k], dist_ratio=d[k] / dmin, n_zones=len(r["zones"]),
                 from_station=float(a == STATION), to_station=float(c == STATION))
        if pa and pc:
            f.update(same_cluster=float(pa[0] == pc[0]), same_block=float(pa[0] == pc[0] and pa[1] == pc[1]),
                     d_block=pc[1] - pa[1], d_row=pc[2] - pa[2], d_col=pc[3] - pa[3],
                     ad_block=abs(pc[1] - pa[1]), ad_row=abs(pc[2] - pa[2]), ad_col=abs(pc[3] - pa[3]))
        else:
            f.update(same_cluster=np.nan, same_block=np.nan, d_block=np.nan, d_row=np.nan, d_col=np.nan,
                     ad_block=np.nan, ad_row=np.nan, ad_col=np.nan)
        h = hist[(st, a, c)]
        f.update(hist_ac=h, hist_ca=hist[(st, c, a)], hist_share=h / out_total if out_total else np.nan,
                 hist_out=out_total)
        rows.append(f)
    return pd.DataFrame(rows)


def build_examples(routes: dict, hist_fn):
    X, y, g, meta = [], [], [], []
    for rid, r in routes.items():
        hist, hist_from = hist_fn(r)
        for a, b in zip(r["runs"], r["runs"][1:]):
            cands = [c for c in r["zones"] if c != a]
            f = features(r, a, cands, hist, hist_from)
            X.append(f)
            y.append(np.array([c == b for c in cands], dtype=np.int8))
            g.append(len(cands))
            meta.append((rid, a, b, cands))
    return pd.concat(X, ignore_index=True), np.concatenate(y), np.array(g), meta


def from_totals(cnt):
    tot = collections.Counter()
    for (st, a, _c), v in cnt.items():
        tot[(st, a)] += v
    return tot


def main():
    RES.mkdir(parents=True, exist_ok=True)
    print("loading", flush=True)
    train, ev = load("train"), load("eval")

    full_hist = history_counts(train)
    full_from = from_totals(full_hist)
    by_date = {}

    def train_hist(r):
        # history from every other date at this station (leave-one-day-out)
        if r["date"] not in by_date:
            h = history_counts(train, exclude_date=r["date"])
            by_date[r["date"]] = (h, from_totals(h))
        return by_date[r["date"]]

    print("building training examples", flush=True)
    Xtr, ytr, gtr, _ = build_examples(train, train_hist)
    print("building eval examples", flush=True)
    Xev, yev, gev, mev = build_examples(ev, lambda r: (full_hist, full_from))

    params = dict(objective="lambdarank", metric="ndcg", ndcg_eval_at=[1], learning_rate=0.05,
                  num_leaves=63, min_data_in_leaf=50, feature_fraction=0.9, verbose=-1, seed=7)
    model = lgb.train(params, lgb.Dataset(Xtr, ytr, group=gtr), num_boost_round=400)
    s_ev = model.predict(Xev)

    def top1(scores, y, groups):
        hit, o = 0, 0
        for n in groups:
            hit += int(y[o + int(np.argmax(scores[o:o + n]))])
            o += int(n)
        return hit / len(groups)

    nearest = -Xev["dist_km"].to_numpy()
    history = Xev["hist_ac"].fillna(0).to_numpy() - 1e-6 * Xev["dist_km"].to_numpy()
    res = dict(
        held_out_transitions=int(len(gev)),
        mean_candidates=float(gev.mean()),
        top1_learned=top1(s_ev, yev, gev),
        top1_nearest_zone=top1(nearest, yev, gev),
        top1_history_only=top1(history, yev, gev),
        feature_importance={k: int(v) for k, v in zip(model.feature_name(), model.feature_importance("gain"))},
    )
    print(json.dumps({k: v for k, v in res.items() if k != "feature_importance"}, indent=2))
    (RES / "zone_model.json").write_text(json.dumps(res, indent=2))
    model.save_model(str(OUT / "zone_model.txt"))

    # Habit cost matrices for every route: cost[a, c] = -log softmax(score over candidates of a).
    print("writing habit-cost matrices", flush=True)
    for split, routes, hist_fn in [("eval", ev, lambda r: (full_hist, full_from)), ("train", train, train_hist)]:
        payload = {}
        for rid, r in routes.items():
            zones = r["zones"]
            k = len(zones)
            cost = np.zeros((k, k), dtype=np.float32)
            hist, hist_from = hist_fn(r)
            if k > 1:
                frames = [features(r, a, [c for c in zones if c != a], hist, hist_from) for a in zones]
                sc_all = model.predict(pd.concat(frames, ignore_index=True)).reshape(k, k - 1)
                for i in range(k):
                    sc = sc_all[i] - sc_all[i].max()
                    logp = sc - np.log(np.exp(sc).sum())
                    cols = [j for j in range(k) if j != i]
                    cost[i, cols] = -logp
            payload[rid] = cost
            payload[rid + "|zones"] = np.array(zones)
        np.savez_compressed(OUT / f"zone_costs_{split}.npz", **payload)
        # stop -> zone assignment used by the router
        rows = [(rid, s, z) for rid, r in routes.items() for s, z in r["zone_of"].items()]
        pd.DataFrame(rows, columns=["route_id", "stop_id", "zone"]).to_parquet(OUT / f"stop_zones_{split}.parquet")
    print("done", flush=True)


if __name__ == "__main__":
    main()
