"""Quick look at route_data + actual sequences: sizes, cities, quality labels, zone behaviour."""
import collections
import json
import pathlib

RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"

for split, rf, sf in [("train", "route_data.json", "actual_sequences.json"),
                      ("eval", "eval_route_data.json", "eval_actual_sequences.json")]:
    routes = json.loads((RAW / rf).read_text())
    seqs = json.loads((RAW / sf).read_text())
    rid0 = next(iter(routes))
    if split == "train":
        r0 = routes[rid0]
        print("route keys:", {k: (v if k != "stops" else f"{len(v)} stops") for k, v in r0.items()})
        print("stop example:", next(iter(r0["stops"].items())))
    n = len(routes)
    stops = [len(r["stops"]) for r in routes.values()]
    stations = collections.Counter(r["station_code"] for r in routes.values())
    quality = collections.Counter(r.get("route_score") for r in routes.values())
    dates = sorted({r["date_YYYY_MM_DD"] for r in routes.values()})
    print(f"\n[{split}] routes={n} stops={sum(stops)} mean={sum(stops)/n:.1f} min={min(stops)} max={max(stops)}")
    print("  stations:", dict(stations.most_common()))
    print("  quality:", dict(quality))
    print("  dates:", dates[0], "to", dates[-1], f"({len(dates)} days)")

    # Zone behaviour: how often does the driver visit each zone contiguously?
    contiguous = total_zones = reentries = 0
    zone_fmt = collections.Counter()
    for rid, r in routes.items():
        order = sorted(seqs[rid]["actual"].items(), key=lambda kv: kv[1])
        zs = [r["stops"][s]["zone_id"] for s, _ in order if r["stops"][s]["type"] != "Station"]
        zs = [z for z in zs if isinstance(z, str)]
        for z in zs[:3]:
            zone_fmt[z[:1] + "-" + ("d" if z[2:3].isdigit() else "?")] += 1
        runs = [z for i, z in enumerate(zs) if i == 0 or zs[i - 1] != z]
        cnt = collections.Counter(runs)
        total_zones += len(cnt)
        contiguous += sum(1 for v in cnt.values() if v == 1)
        reentries += sum(v - 1 for v in cnt.values())
    print(f"  zones visited contiguously: {contiguous/total_zones:.1%} ({reentries} re-entries over {total_zones} zone-visits)")
    sample = next(iter(routes.values()))
    order = sorted(seqs[next(iter(routes))]["actual"].items(), key=lambda kv: kv[1])
    print("  sample zone sequence:", [sample["stops"][s].get("zone_id") for s, _ in order][:40])
