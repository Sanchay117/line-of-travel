"""Build the website's data from benchmark results.

Reads   docs/results/bench_eval.jsonl   (node bench/run.mjs --split eval ...)
        docs/results/bench_train.jsonl  (optional: route-quality validation)
        docs/results/ortools_eval.jsonl (optional: solver-quality check)
        docs/results/zone_model.json
Writes  web/public/data/summary.json      headline numbers, chart data, evidence list
        web/public/data/routes.json       curated held-out routes (metadata)
        web/public/data/r/<route>.bin     float32 travel matrix (n*n) + habit matrix (k*k)
        docs/results/summary.json         same numbers, for the README and the deck
"""
import json
import math
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
RES = ROOT / "docs" / "results"
WEB = ROOT / "web" / "public" / "data"

DEFAULT = "habit_30_300"
LOT_LABELS = {
    "habit_0_600": "Line of Travel, zones only",
    "habit_30_300": "Line of Travel (default)",
    "habit_60_600": "Line of Travel, high trust",
    "habit_120_1200": "Line of Travel, 120/1200",
    "habit_300_1200": "Line of Travel, maximum trust",
}
CITY = {"DLA": "Los Angeles", "DSE": "Seattle", "DBO": "Boston", "DCH": "Chicago", "DAU": "Austin"}


def load_jsonl(path):
    out = []
    for line in path.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass  # a line still being written by a running benchmark
    return out


def flat(rows):
    recs = []
    for r in rows:
        d = r["m"]["driver"]
        for k, m in r["m"].items():
            recs.append(dict(id=r["id"], station=r["station"], quality=r.get("quality"), n=r["n"], windows=r["windows"],
                             method=k, travel=m["travel"], d_travel=d["travel"], duration=m["duration"],
                             late=m["lateStops"], reentries=m["reentries"], score=m["score"], ms=m.get("ms", np.nan)))
    df = pd.DataFrame(recs)
    df["saving"] = 100 * (df.d_travel - df.travel) / df.d_travel
    return df


def agg(df):
    g = df.groupby("method", sort=False)
    return pd.DataFrame({
        "routes": g.id.count(),
        "saving": 100 * (g.d_travel.sum() - g.travel.sum()) / g.d_travel.sum(),
        "median_saving": g.saving.median(),
        "score": g.score.mean(),
        "reentries": g.reentries.mean(),
        "late": g.late.sum(),
        "ms": g.ms.mean(),
        "hours": g.travel.sum() / 3600,
    })


def bootstrap_ci(df, method, reps=2000, seed=7):
    sub = df[df.method == method]
    t, d = sub.travel.to_numpy(), sub.d_travel.to_numpy()
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(t), size=(reps, len(t)))
    s = 100 * (d[idx].sum(1) - t[idx].sum(1)) / d[idx].sum(1)
    return float(np.percentile(s, 2.5)), float(np.percentile(s, 97.5))


def pick_routes(df, per_city=7):
    wide = df.pivot_table(index="id", columns="method", values=["saving", "reentries", "score"])
    meta = df[df.method == "driver"].set_index("id")[["station", "n", "windows"]]
    w = meta.join(pd.DataFrame({
        "lot_saving": wide["saving"][DEFAULT], "lot_re": wide["reentries"][DEFAULT],
        "tsp_re": wide["reentries"]["tsp"], "lot_score": wide["score"][DEFAULT],
    }))
    w["city"] = w.station.str[:3].map(CITY)
    ok = w[(w.n >= 80) & (w.n <= 190)]
    picks, hero = [], None
    q = ok.lot_saving.quantile([0.75, 0.93])
    showcase = ok[(ok.lot_saving.between(q[0.75], q[0.93])) & (ok.lot_re == 0) & (ok.tsp_re >= 14)
                  & (ok.n.between(110, 170)) & (ok.windows > 0)].sort_values("lot_score")
    if len(showcase):
        hero = showcase.index[0]
    for city, g in ok.groupby("city"):
        g = g.sort_values("lot_saving")
        qs = np.linspace(0.2, 0.95, per_city)
        chosen = []
        for qv in qs:
            i = int(round(qv * (len(g) - 1)))
            rid = g.index[i]
            while rid in chosen and i + 1 < len(g):
                i += 1
                rid = g.index[i]
            chosen.append(rid)
        # open each city on a typical good route (about the 70th percentile), then the rest
        lead = chosen[int(round(0.66 * (len(chosen) - 1)))]
        picks += [lead] + [c for c in chosen if c != lead]
    if hero and hero not in picks:
        picks.insert(0, hero)
    return picks, hero, w


def export_routes(ids):
    bench = json.loads((P / "bench_eval.json").read_text())
    by = {r["id"]: r for r in bench["routes"]}
    routes = pd.read_parquet(P / "routes_eval.parquet").set_index("route_id")
    tt = np.load(P / "tt_eval.npy", mmap_mode="r")
    hb = np.fromfile(P / "habit_eval.bin", dtype=np.float32)
    (WEB / "r").mkdir(parents=True, exist_ok=True)
    out = []
    for rid in ids:
        r = by[rid]
        n, k = r["n"], r["k"]
        T = np.asarray(tt[r["tt"]:r["tt"] + n * n], dtype=np.float32)
        H = hb[r["h"]:r["h"] + k * k].astype(np.float32)
        (WEB / "r" / f"{rid}.bin").write_bytes(T.tobytes() + H.tobytes())
        meta = {key: r[key] for key in ["id", "n", "k", "station", "date", "zones", "actual", "zone", "service",
                                        "twStart", "twEnd", "lat", "lng", "cap", "vol"]}
        meta["departure_utc"] = float(routes.loc[rid, "departure_utc"])
        out.append(meta)
    (WEB / "routes.json").write_text(json.dumps(out))
    return out


def driver_contiguity():
    """Share of (route, zone) pairs the driver finishes in a single visit, held-out routes."""
    bench = json.loads((P / "bench_eval.json").read_text())
    single = total = 0
    for r in bench["routes"]:
        z = [r["zone"][i] for i in r["actual"][1:]]
        runs = {}
        for k, zk in enumerate(z):
            if k == 0 or zk != z[k - 1]:
                runs[zk] = runs.get(zk, 0) + 1
        single += sum(1 for v in runs.values() if v == 1)
        total += len(runs)
    return dict(single_visit=single / total, zones=total, zones_per_route=total / len(bench["routes"]))


def scenario_summary():
    """Aggregate bench/scenarios.mjs output: per scenario and method, totals and change vs the driver."""
    path = RES / "scenarios_eval.jsonl"
    if not path.exists():
        return None
    rows = load_jsonl(path)
    out = dict(routes=len(rows), rows=[])
    names = dict(base="Normal day", late="Van leaves 45 min late", rush="8 same-day orders added")
    for sc in ["base", "late", "rush"]:
        tot = {m: dict(travel=0, duration=0, late=0, re=0) for m in ["driver", "lot", "tsp"]}
        for r in rows:
            for m in tot:
                x = r[sc][m]
                tot[m]["travel"] += x["travel"]; tot[m]["duration"] += x["duration"]
                tot[m]["late"] += x["lateStops"]; tot[m]["re"] += x["reentries"]
        d = tot["driver"]
        rec = dict(key=sc, label=names[sc])
        for m, t in tot.items():
            rec[m] = dict(saving=100 * (d["travel"] - t["travel"]) / d["travel"],
                          day_saving=100 * (d["duration"] - t["duration"]) / d["duration"],
                          late=t["late"], reentries=t["re"] / len(rows), hours=t["travel"] / 3600)
        out["rows"].append(rec)
    return out


def ablation(ev):
    """First engine (docs/results/v1) against the current one, on the same routes."""
    path = RES / "v1" / "bench_eval.jsonl"
    if not path.exists():
        return None
    v1 = flat(load_jsonl(path))
    v1 = v1[v1.id.isin(set(ev.id))]
    out = {}
    for k in [DEFAULT, "habit_0_600", "tsp"]:
        row = {}
        for name, df in [("v1", v1), ("v2", ev[ev.id.isin(set(v1.id))])]:
            s = df[df.method == k]
            row[name] = dict(saving=float(100 * (s.d_travel.sum() - s.travel.sum()) / s.d_travel.sum()),
                             score=float(s.score.mean()), reentries=float(s.reentries.mean()),
                             worse=float((s.saving < 0).mean()), worse4=float((s.saving < -4).mean()), late=int(s.late.sum()))
        out[k] = row
    return out


def main():
    WEB.mkdir(parents=True, exist_ok=True)
    ev = flat(load_jsonl(RES / "bench_eval.jsonl"))
    a = agg(ev)
    print(a.round(4).to_string())
    drv, tsp, lot = a.loc["driver"], a.loc["tsp"], a.loc[DEFAULT]
    lo, hi = bootstrap_ci(ev, DEFAULT)
    tlo, thi = bootstrap_ci(ev, "tsp")
    zone = json.loads((RES / "zone_model.json").read_text())
    n_routes = int(drv.routes)
    windowed = int(ev[ev.method == "driver"].windows.sum())
    hours_saved = float(drv.hours - lot.hours)

    # frontier points
    frontier = [dict(key="driver", label="Driver's order", saving=0.0, score=0.0, reentries=float(drv.reentries), dy=-10),
                dict(key="nearest", label="Nearest neighbour", saving=float(a.loc["nearest", "saving"]),
                     score=float(a.loc["nearest", "score"]), reentries=float(a.loc["nearest", "reentries"]), dy=18),
                dict(key="tsp", label="Shortest path", saving=float(tsp.saving), score=float(tsp.score),
                     reentries=float(tsp.reentries))]
    for k, lab in LOT_LABELS.items():
        if k in a.index:
            frontier.append(dict(key=k, label=lab, lot=True, primary=k == DEFAULT, saving=float(a.loc[k, "saving"]),
                                 score=float(a.loc[k, "score"]), reentries=float(a.loc[k, "reentries"]),
                                 showLabel=k in (DEFAULT, "habit_0_600"), dy=4 if k == DEFAULT else -12,
                                 anchor="end" if k == DEFAULT else "start"))

    # histogram of per-route savings at the default setting
    # Values past either end go in labelled tail bins instead of piling into the edge bins.
    raw = ev[ev.method == DEFAULT].saving
    edges = list(range(-4, 17, 1))
    counts, _ = np.histogram(raw[(raw >= -4) & (raw < 16)], bins=edges)
    hist = dict(n=n_routes, median=float(raw.median()),
                bins=[dict(x0=edges[i], x1=edges[i + 1], count=int(c)) for i, c in enumerate(counts)],
                under=dict(x1=-4, count=int((raw < -4).sum())), over=dict(x0=16, count=int((raw >= 16).sum())),
                worse=float((raw < 0).mean()))

    # route-quality validation (training routes carry Amazon's High/Medium/Low label)
    quality = dict(title="Amazon's own quality labels agree.", sub="Pending: run the training benchmark.", rows=[])
    tr_path = RES / "bench_train.jsonl"
    if tr_path.exists():
        tr = flat(load_jsonl(tr_path))
        t = tr[tr.method == "tsp"].groupby("quality").saving.agg(["median", "count"])
        med = {q: float(t.loc[q, "median"]) for q in t.index}
        labels = [q for q in ["High", "Medium", "Low"] if q in med]
        spread = max(med[q] for q in labels) - min(med[q] for q in labels)
        # The title states what the data shows, whichever way it falls.
        if spread < 1.5:
            kind, title = "flat", f"Even routes Amazon rated High have about {med.get('High', 0):.0f}% to recover."
        elif all(q in med for q in ["High", "Medium", "Low"]) and med["Low"] > med["Medium"] > med["High"]:
            kind, title = "ordered", "Routes Amazon rated worse have more time to recover."
        elif "High" in med and "Low" in med and med["Low"] > med["High"]:
            kind, title = "agree", "Low-rated routes have more time to recover than High-rated ones."
        else:
            kind, title = "none", "Amazon's quality labels do not track recoverable time."
        n_tr = len(tr[tr.method == "tsp"])
        sub = f"Median drive time a shortest path recovers, by Amazon's own route-quality label, {n_tr:,} training routes."
        if kind == "flat":
            sub += " The labels do not predict the waste, so the saving is not confined to a few badly run routes."
        mark = "High" if kind == "flat" else "Low"
        quality = dict(
            title=title, sub=sub, kind=kind,
            rows=[dict(label=q, note=f"{int(t.loc[q, 'count']):,} routes", value=float(t.loc[q, "median"]), hi=q == mark)
                  for q in labels])
        quality["raw"] = {q: dict(median=float(t.loc[q, "median"]), n=int(t.loc[q, "count"])) for q in t.index}

    checks = [
        f"<b>Held-out test.</b> The habit model learns from Amazon's {6112:,} training routes. Every number here is scored on the {n_routes:,} evaluation routes Amazon held back.",
        "<b>Official metric.</b> Amazon score uses a port of the challenge scorer that matches the original exactly on 40 randomised test routes.",
        f"<b>Uncertainty.</b> Drive time saved at the default setting: {lot.saving:.1f}% (95% bootstrap interval {lo:.1f}% to {hi:.1f}%). Shortest path: {tsp.saving:.1f}% ({tlo:.1f}% to {thi:.1f}%).",
        f"<b>Delivery windows.</b> {windowed:,} stops have a time window. Late stops: driver's order {int(drv.late)}, Line of Travel {int(lot.late)}.",
        "<b>No leakage.</b> Station-history features for a training route only count other days; evaluation routes only see training history.",
        "<b>Honest limit.</b> Travel times are Amazon's planned estimates, not GPS traces, so savings are measured in Amazon's own matrix. Drivers may know shortcuts the matrix does not.",
    ]
    ort_path = RES / "ortools_eval.jsonl"
    ortools = None
    if ort_path.exists():
        o = pd.DataFrame(load_jsonl(ort_path)).set_index("id")
        # Like for like: OR-Tools solves travel time only, so compare our engine run without windows.
        nw_path = RES / "tsp_nowin_eval.jsonl"
        nw = flat(load_jsonl(nw_path)) if nw_path.exists() else ev
        ours = nw[nw.method == "tsp"].set_index("id").travel
        j = o.join(ours.rename("ours"), how="inner")
        gap = 100 * (j.ours.sum() - j.travel.sum()) / j.travel.sum()
        ortools = dict(routes=len(j), gap_pct=float(gap), ortools_s=float(j.wall_s.mean()), better_or_equal=float((j.ours <= j.travel).mean()))
        checks.insert(2, f"<b>Solver quality.</b> On {len(j)} routes our engine's shortest path (the code the browser runs) is {abs(gap):.2f}% {'longer' if gap > 0 else 'shorter'} than Google OR-Tools given {j.wall_s.mean():.0f} s per route, with a {tsp.ms/1000:.1f} s budget.")

    scen = scenario_summary()
    abl = ablation(ev)
    if abl:
        a1, a2 = abl[DEFAULT]["v1"], abl[DEFAULT]["v2"]
        share = lambda v: f"{v * 100:.0f}%" if v >= 0.1 else f"{v * 100:.1f}%"  # 2.4% must not read as 2%
        checks.insert(3, f"<b>Ablation.</b> Our first engine saved {a1['saving']:.1f}% and drove longer than the driver on {share(a1['worse'])} of routes. Moving whole zones in the search and counting lateness when accepting a tour took that to {a2['saving']:.1f}% and {share(a2['worse'])}.")
    # Impact: driver time saved per route, priced at the BLS 2025 median wage for delivery drivers.
    wage, vans, days = 21.13, 100, 250
    min_per_route = hours_saved * 60 / n_routes
    impact = dict(wage=wage, vans=vans, days=days, min_per_route=min_per_route,
                  station_hours_day=min_per_route * vans / 60, station_usd_year=min_per_route * vans / 60 * wage * days)

    stats_raw = dict(eval_routes=n_routes, saving=float(lot.saving), tsp_saving=float(tsp.saving),
                     worse=float((raw < 0).mean()), worse4=float((raw < -4).mean()), impact=impact,
                     contiguity=driver_contiguity(), total_stops=904527 + 433231, train_routes=6112,
                     reentries=float(lot.reentries), driver_reentries=float(drv.reentries), tsp_reentries=float(tsp.reentries),
                     late_driver=int(drv.late), late_lot=int(lot.late), late_tsp=int(tsp.late), ms=float(lot.ms),
                     hours_saved=hours_saved, ci=[lo, hi], tsp_ci=[tlo, thi], score=float(lot.score), tsp_score=float(tsp.score),
                     zone_top1=zone["top1_learned"], zone_nearest=zone["top1_nearest_zone"], zone_history=zone["top1_history_only"],
                     windowed_stops=windowed, median_saving=hist["median"], ortools=ortools)
    stats = dict(
        eval_routes=f"{n_routes:,}", train_routes="6,112", train_stops="904,527",
        headline_saving=f"−{lot.saving:.1f}%<small>{hours_saved:,.0f} driver-hours over {n_routes:,} routes</small>",
        headline_reentries=f"{lot.reentries:.2f}<small>drivers {drv.reentries:.1f} · shortest path {tsp.reentries:.1f}</small>",
        headline_late=f"{max(0, int(lot.late) - int(drv.late))}<small>{int(lot.late)} late vs the driver's {int(drv.late)}, of {windowed:,} windowed stops</small>",
        tsp_saving_abs=f"{tsp.saving:.1f}%", tsp_reentries=f"{tsp.reentries:.0f}", driver_reentries=f"{drv.reentries:.1f}",
        zone_top1=f"{zone['top1_learned']*100:.0f}%", zone_nearest=f"{zone['top1_nearest_zone']*100:.0f}%",
    )
    picks, hero, _ = pick_routes(ev)
    out = export_routes(picks)
    summary = dict(
        hero=hero, stats=stats, stats_raw=stats_raw, frontier=frontier, hist=hist, quality=quality, checks=checks,
        scenarios=scen, ablation=abl,
        zone=dict(n=zone["held_out_transitions"], candidates=zone["mean_candidates"], rows=[
            dict(label="Nearest zone", value=zone["top1_nearest_zone"]),
            dict(label="Station history", value=zone["top1_history_only"]),
            dict(label="Learned ranker", value=zone["top1_learned"], hi=True)]),
        methods={k: {c: (None if isinstance(v, float) and math.isnan(v) else float(v)) for c, v in a.loc[k].items()} for k in a.index},
        # public URLs, filled in links.json once the repo and site are published
        links={**dict(repo="https://github.com/", deck="./LineOfTravel_DataNova2026.pdf", demo=""),
               **(json.loads((ROOT / "links.json").read_text()) if (ROOT / "links.json").exists() else {})},
    )
    (WEB / "summary.json").write_text(json.dumps(summary, indent=1))
    (RES / "summary.json").write_text(json.dumps(summary, indent=1))
    print(f"hero {hero}; {len(out)} routes exported; default saves {lot.saving:.2f}% [{lo:.2f}, {hi:.2f}]")


if __name__ == "__main__":
    main()
