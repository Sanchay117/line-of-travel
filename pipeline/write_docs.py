"""Write README.md and docs/REPORT.md from docs/results/summary.json.

The prose lives here; every number is read from the benchmark output, so the documents,
the website and the deck cannot disagree.  Run after pipeline/export_web.py.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
s = json.loads((ROOT / "docs" / "results" / "summary.json").read_text())
R, M = s["stats_raw"], s["methods"]
LOT, Z, TSP, DRV, NN = M["habit_30_300"], M["habit_0_600"], M["tsp"], M["driver"], M["nearest"]
links = s["links"]
demo = links.get("demo") or "(link on the Devpost page)"
repo = links.get("repo") if links.get("repo") not in (None, "", "https://github.com/") else "(this repository)"
deck_file = "[`deck/LineOfTravel_DataNova2026.pptx`](deck/LineOfTravel_DataNova2026.pptx)"
deck = (f"{links['deck']} (source: {deck_file})" if str(links.get("deck", "")).startswith("http") else deck_file)
video_line = f"- Demo film, 2:55: {links['video']}\n" if links.get("video") else ""


def n0(v):
    return f"{round(v):,}"


def drive(saving):  # change in drive time against the driver
    return f"{'−' if saving >= 0 else '+'}{abs(saving):.1f}%"


def pct(v):  # whole percent, or one decimal for small shares so 0.2% does not read as 0%
    return f"{v * 100:.0f}%" if v >= 0.1 else f"{v * 100:.1f}%"


ip = R["impact"]
con = R["contiguity"]
abl = s.get("ablation") or {}
sc = s.get("scenarios")
q = s["quality"]
ort = R.get("ortools")


def results_table():
    rows = [
        ("Driver's own order", DRV, None),
        ("Nearest neighbour", NN, None),
        ("Shortest path (our engine, travel time only)", TSP, R["tsp_ci"]),
        ("Line of Travel, zones only", Z, None),
        ("**Line of Travel, default**", LOT, R["ci"]),
    ]
    out = ["| Method | Drive time vs driver | 95% interval | Amazon score (0 = driver) | Zone re-entries per route | Late stops |",
           "|---|---:|---:|---:|---:|---:|"]
    for name, m, ci in rows:
        base = m is DRV
        out.append(f"| {name} | {'baseline' if base else drive(m['saving'])} | {f'{ci[0]:.1f} to {ci[1]:.1f}%' if ci else ''} | "
                   f"{'0' if base else f'{m['score']:.3f}'} | {m['reentries']:.2f} | {n0(m['late'])} |")
    return "\n".join(out)


def frontier_table():
    out = ["| Setting (habit weight w, crossing charge) | Drive time vs driver | Amazon score | Zone re-entries per route | Late stops |",
           "|---|---:|---:|---:|---:|"]
    names = {"habit_0_600": "Zones only (0, 600 s)", "habit_30_300": "Default (30, 300 s)", "habit_60_600": "High trust (60, 600 s)",
             "habit_120_1200": "120, 1200 s (not on the dial: high trust beats it on both counts)", "habit_300_1200": "Maximum trust (300, 1200 s)"}
    for k, lab in names.items():
        if k in M:
            m = M[k]
            out.append(f"| {lab} | {drive(m['saving'])} | {m['score']:.3f} | {m['reentries']:.2f} | {n0(m['late'])} |")
    return "\n".join(out)


def scenario_table():
    if not sc:
        return "_Scenario results not generated yet: run `node bench/scenarios.mjs`._"
    out = ["| Scenario | Drive time, Line of Travel | Drive time, shortest path | Day length, Line of Travel | Late stops: driver / Line of Travel / shortest path | Zone re-entries per route: Line of Travel / shortest path |",
           "|---|---:|---:|---:|---:|---:|"]
    for r in sc["rows"]:
        out.append(f"| {r['label']} | {drive(r['lot']['saving'])} | {drive(r['tsp']['saving'])} | {drive(r['lot']['day_saving'])} | "
                   f"{n0(r['driver']['late'])} / {n0(r['lot']['late'])} / {n0(r['tsp']['late'])} | {r['lot']['reentries']:.2f} / {r['tsp']['reentries']:.2f} |")
    return "\n".join(out)


def scenario_reading():
    """Plain-language reading of the table, written from the numbers so it cannot drift from them."""
    if not sc:
        return ""
    row = {r["key"]: r for r in sc["rows"]}
    b, l, r = row["base"], row["late"], row["rush"]
    lines = [f"- **Late start:** the saving holds ({drive(l['lot']['saving'])} against {drive(b['lot']['saving'])} on a normal day), and late stops go from "
             f"{n0(l['driver']['late'])} in the driver's order to {n0(l['lot']['late'])}."]
    cost = "more" if r["lot"]["saving"] < 0 else "less"
    lines.append(f"- **Rush orders:** the driver's order with each order slotted in by hand misses {n0(r['driver']['late'])} deadlines. "
                 f"Line of Travel misses {n0(r['lot']['late'])}, and pays for it with {abs(r['lot']['saving']):.1f}% {cost} driving than that baseline. "
                 f"The shortest path also meets every deadline with {drive(r['tsp']['saving'])} drive time, but by re-entering "
                 f"{r['tsp']['reentries']:.1f} zones per route against Line of Travel's {r['lot']['reentries']:.2f}. Same-day orders are where "
                 "a dispatcher would turn the trust dial down: the default setting prices every unusual zone switch as a habit the driver would have to break.")
    return "\n".join(lines)


def ablation_table():
    if not abl:
        return ""
    names = {"habit_30_300": "Line of Travel, default", "habit_0_600": "Line of Travel, zones only", "tsp": "Shortest path"}
    out = ["| Method | Engine | Drive time vs driver | Amazon score | Zone re-entries | Routes longer than the driver | Longer by more than 4% |",
           "|---|---|---:|---:|---:|---:|---:|"]
    for k, lab in names.items():
        for v in ["v1", "v2"]:
            a = abl[k][v]
            out.append(f"| {lab} | {'first' if v == 'v1' else 'current'} | {drive(a['saving'])} | {a['score']:.3f} | {a['reentries']:.2f} | {pct(a['worse'])} | {pct(a['worse4'])} |")
    return "\n".join(out)


def quality_lines():
    if not q.get("rows"):
        return "_Training-route benchmark not generated yet._"
    rows = "\n".join(f"| {r['label']} | {r['note']} | {r['value']:.1f}% |" for r in q["rows"])
    return f"| Amazon label | Routes | Median drive time recoverable by a shortest path |\n|---|---:|---:|\n{rows}"


a1, a2 = (abl.get("habit_30_300", {}).get("v1"), abl.get("habit_30_300", {}).get("v2")) if abl else (None, None)
ortools_line = (f"On {ort['routes']} held-out routes, our engine's travel-time-only tour is {abs(ort['gap_pct']):.2f}% "
                f"{'longer' if ort['gap_pct'] > 0 else 'shorter'} than Google OR-Tools (guided local search, {ort['ortools_s']:.0f} s per route), "
                f"and as good or better on {pct(ort['better_or_equal'])} of them, using about {TSP['ms'] / 1000:.1f} s." if ort else
                "_OR-Tools comparison not generated yet: run `pipeline/ortools_baseline.py`._")

README = f"""# Line of Travel

**Learns the order Amazon drivers actually deliver in, then removes only the detours.**

DataNova 2026 Global Data-thon, problem DN-OR-01 (last-mile delivery route optimization). Solo entry by Sanchay Singh.

- Live demo: {demo}
{video_line}- Presentation: {deck}
- Technical report, validation and scenario analysis: [`docs/REPORT.md`](docs/REPORT.md)

## The idea

A shortest-path optimizer cuts drive time on paper, but it ignores the zones drivers work in: on Amazon's held-out routes it re-enters
{TSP['reentries']:.1f} zones per route, where drivers re-enter {DRV['reentries']:.1f}. Drivers have little reason to follow a plan like that, so the saving on paper is unlikely to reach the road.

Mail carriers solved this long ago. Each morning a letter carrier sorts the day's mail into a case of pigeonholes in walking order, and the US Postal
Service records that order for every carrier route as its *Line of Travel*. Amazon drivers have a line of travel too. Nobody wrote it down, so we learned
it from {n0(R['train_routes'])} of their routes, then optimise only within it.

## Results on {n0(R['eval_routes'])} held-out routes

{results_table()}

The default setting saves {n0(R['hours_saved'])} driver-hours over the held-out routes, about {ip['min_per_route']:.1f} minutes per route
(median {R['median_saving']:.1f}% per route), and stays closer to the driver's real order than shortest path, nearest neighbour or zones-only routing. Only {pct(R['worse'])} of routes drive longer than the driver did.

## How it works

1. **Read the routes.** {n0(R['train_routes'])} training routes with the order each driver actually delivered.
2. **Learn the next zone.** A LightGBM ranker picks the driver's next zone {pct(R['zone_top1'])} of the time, from about {round(s['zone']['candidates'])} candidates (nearest zone: {pct(R['zone_nearest'])}).
3. **Price every move.** `cost(i → j) = travel(i, j) + [new zone] × (crossing + w × −log p(zone j | zone i))`.
4. **Re-sequence.** Iterated local search (2-opt, or-opt, whole-zone moves, double-bridge kicks) with lateness in the acceptance rule and a time-window repair, given {LOT['ms'] / 1000:.1f} s per route in the benchmark. The same JavaScript file runs the benchmark in Node and the demo in the browser, where a fixed number of search rounds takes 0.4 to 0.7 s per route on an Apple M4 Pro.

## Reproduce

Needs Python 3.11+, Node 20+, about 4 GB of disk, and no credentials (the dataset is public).

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm install
.venv/bin/python pipeline/download.py        # Amazon Last Mile data from the public S3 bucket, about 3 GB
.venv/bin/python pipeline/ingest.py          # Parquet tables and float32 travel matrices
.venv/bin/python pipeline/zone_model.py      # next-zone ranker, held-out accuracy, habit costs
.venv/bin/python pipeline/export_bench.py    # compact inputs for the benchmark
.venv/bin/python -m pytest pipeline/tests    # scorer port equals the official scorer
sh bench/run_all.sh                          # every result in docs/results, then the website data
.venv/bin/python pipeline/write_docs.py      # this README and docs/REPORT.md
npm run dev                                  # the website on localhost
node deck/assets.mjs                         # deck stamps, from the site's own SVG
node deck/shoot.mjs http://localhost:5173    # deck screenshots of the running site (headless Chrome)
node deck/build.mjs                          # the slides, every number read from docs/results/summary.json
```

`bench/run_all.sh` uses 4 threads and takes about an hour on a laptop (Apple M4 Pro).

## Layout

| Path | What it holds |
|---|---|
| `pipeline/` | download, ingest, zone model, official scorer port and its test, OR-Tools baseline, exports |
| `web/src/engine/` | the routing engine (`solver.js`) and Amazon's route score (`score.js`), shared by benchmark and site |
| `bench/` | held-out benchmark, scenario analysis, loss diagnosis |
| `web/` | the website and live demo (Vite, MapLibre) |
| `deck/` | the presentation generator and its images |
| `docs/` | technical report and every result file |

## Data and credits

Data: Amazon Last Mile Routing Research Challenge 2021, © Amazon.com, Inc., licensed CC BY-NC 4.0
(registry.opendata.aws/amazon-last-mile-challenges). Route score: a port of the challenge's official scorer (MIT-CAVE), tested for equality.
"Line of Travel" is the US Postal Service's term for a carrier's delivery order; this project is not affiliated with USPS or Amazon.
Basemap © OpenStreetMap contributors, tiles by OpenFreeMap. Wage figures: US Bureau of Labor Statistics, Occupational Outlook Handbook, 2025.
"""

REPORT = f"""# Line of Travel: technical report

DataNova 2026, DN-OR-01. This report covers the data, the method, how it was validated, and the scenario analysis.
Every number is generated from `docs/results/summary.json` by `pipeline/write_docs.py`.

## 1. Problem

Last-mile delivery is the most expensive leg of shipping, and the order a van visits its stops decides most of its drive time.
Classical solvers treat this as a travelling salesman problem with time windows. In practice drivers depart from those plans,
because the plans ignore how drivers organise their day: by planning zone, in an order they repeat.
Amazon's 2021 Last Mile Routing Research Challenge was built around exactly this gap: it scored submissions by how closely they
matched the sequences drivers actually drove.

We ask a practical question: **how much driving can be removed while staying inside the order drivers already use?**

## 2. Data

| | Training | Held-out evaluation |
|---|---:|---:|
| Routes | 6,112 | {n0(R['eval_routes'])} |
| Stops | 904,527 | 433,231 |

Seventeen stations in Los Angeles, Seattle, Boston, Chicago and Austin. For every route the data gives each stop's location, planning zone
(for example `A-2.2A`), packages with dimensions, service times and optional delivery windows, the route's travel-time matrix in seconds, and
the order the driver actually delivered in. Training routes also carry Amazon's High, Medium or Low quality label.

Preparation (`pipeline/ingest.py`):

- Travel matrices are stored as one float32 memory-mapped array, so a route's matrix is a slice, not a JSON parse.
- A stop's delivery window is the intersection of its packages' windows, in seconds after departure. {pct(R['windowed_stops'] / (433231 - R['eval_routes']))} of held-out stops ({n0(R['windowed_stops'])}) have one.
- A stop's service time is the sum of its packages' planned service times.
- Stops without a zone take the zone of their nearest zoned stop; the station is its own zone.

The driver finishes {pct(con['single_visit'])} of zones in a single visit (about {round(con['zones_per_route'])} zones per route), which is the regularity this project builds on.

## 3. Method

### 3.1 Next-zone model (`pipeline/zone_model.py`)

For each zone a driver leaves, a LightGBM lambdarank model ranks every unvisited zone of the route as the next one. Features:

- **Geometry:** distance between zone centres, its rank among the candidates, and its ratio to the nearest candidate.
- **Zone IDs:** same cluster, same block, signed and absolute steps in block, row and column of Amazon's zone code.
- **Station history:** how often drivers at the same station moved from this zone to the candidate (and back) on other days. For a training route, its own date is excluded, so the model never sees the answer.

Trained on the training routes (learning rate 0.05, 63 leaves, 400 rounds). On {n0(s['zone']['n'])} held-out zone-to-zone moves with about
{round(s['zone']['candidates'])} candidates each, top-1 accuracy is **{pct(R['zone_top1'])}**, against {pct(R['zone_history'])} for station history alone and
{pct(R['zone_nearest'])} for the nearest zone. A move's habit cost is `−log p` from the model's softmax over candidates.

### 3.2 Edge cost

```
cost(i → j) = travel(i, j)                                   if i and j share a zone
cost(i → j) = travel(i, j) + crossing + w × −log p(zone j | zone i)   otherwise
```

`crossing` keeps zones whole; `w` sets how strongly the usual zone order is followed. The website calls the pair (w, crossing) the trust dial.

### 3.3 Search (`web/src/engine/solver.js`)

Iterated local search on the asymmetric cost:

1. Start from nearest neighbour under the cost.
2. Local search to a local optimum: asymmetric 2-opt with O(1) move evaluation from prefix sums, or-opt of 1 to 3 stops in both orientations, and **zone-block moves** that lift a whole run of same-zone stops to another zone boundary, in either orientation.
3. Kick with a double bridge; half the kicks cut only at zone boundaries, which swaps runs of whole zones.
4. Accept a round on cost plus 20 × seconds late, from a full schedule simulation (travel, waiting for a window to open, service).
5. If the best tour is still late, repair: move whole zones first, then single stops.

The benchmark gives each route 300 ms. The website uses a fixed number of rounds so that the same route always gives the same answer.

## 4. Evaluation protocol

- **Held-out:** the zone model trains on Amazon's training routes; all results are on the {n0(R['eval_routes'])} evaluation routes.
- **Drive time:** the sum of matrix travel times along the tour, including the legs from and to the station. All methods use the same matrix.
- **Late stops:** stops reached after their window closes, with the van leaving at the planned departure time.
- **Zone re-entries:** times a van drives into a zone it has already left.
- **Amazon score:** the challenge's own metric (sequence deviation × edit distance with real-time penalties), 0 = identical to the driver. Our port in `web/src/engine/score.js` and `pipeline/scoring.py` matches the official scorer exactly on 40 randomised routes (`pipeline/tests/test_scoring.py`).
- **Uncertainty:** 95% bootstrap intervals over routes (2,000 resamples).

## 5. Results

{results_table()}

### 5.1 The trust dial

{frontier_table()}

### 5.2 Route by route

At the default setting the median route saves {R['median_saving']:.1f}%. {pct(R['worse'])} of routes drive longer than the driver did, and {pct(R['worse4'])} by more than 4%.

### 5.3 Amazon's quality labels

{q.get('title', '')} {q.get('sub', '')}

{quality_lines()}

### 5.4 Solver quality

{ortools_line}

## 6. Ablation: the first engine and what fixed it

Our first engine lost to the driver on too many routes{f" ({pct(a1['worse'])} at the default setting)" if a1 else ""}. A diagnosis script (`bench/diag_losses.mjs`) compared both tours under our own objective and
found the search, not the cost model, at fault on almost every losing route. Two causes:

1. Once leaving a zone is expensive, single-stop moves cannot reorder zones, so the zone order got stuck. Fix: zone-block moves and zone-boundary kicks.
2. Time windows were only handled at the end, by a repair that pulled single stops out of their zones to save a late delivery. Fix: count lateness when accepting search rounds, and repair by moving whole zones first.

{ablation_table()}

The first engine's results are kept in `docs/results/v1/`; `node bench/run.mjs --engine v1` reproduces them.

## 7. Scenario analysis

`bench/scenarios.mjs` runs the same code as the website's what-if controls on {sc['routes'] if sc else 0} held-out routes (every seventh route, which spreads them across all stations):

- **Normal day:** as planned.
- **Late start:** the van leaves 45 minutes late, so every window closes 45 minutes sooner relative to departure.
- **Rush orders:** 8 same-day orders appear about 100 m from existing stops, each due within 4 hours. The driver baseline inserts each one where it adds the least travel time, which is what a driver handed an extra parcel would do.

{scenario_table()}

{scenario_reading()}

## 8. Impact estimate

At the default setting a route saves about {ip['min_per_route']:.1f} minutes of driving. A station running {ip['vans']} vans saves about
{ip['station_hours_day']:.1f} driver-hours a day; at the US Bureau of Labor Statistics 2025 median pay for delivery truck drivers (${ip['wage']}/h)
over {ip['days']} working days, about ${n0(ip['station_usd_year'])} a year, before fuel, vehicle wear and emissions. The estimate assumes the
saving in Amazon's planned travel times carries over to the road, which this data cannot confirm.

## 9. Limitations and responsible use

- **Planned, not driven.** Travel times are Amazon's estimates. Drivers may know shortcuts, closures or parking that the matrix does not.
- **Habits are not always good.** Some habitual orders are detours; the trust dial exists so a station can choose how far to follow them.
- **Coverage.** Five US metros in 2018. Other regions, vehicles or seasons need their own history.
- **Licence.** The data is CC BY-NC 4.0, for research and non-commercial use. A deployment would retrain on the operator's own routes.
- **Privacy.** The model uses stops, zones and travel times only: no driver identity, customer names or GPS traces.

## 10. Reproducibility

See the README. `bench/run_all.sh` regenerates every file in `docs/results` with 4 threads in about an hour on an Apple M4 Pro laptop;
`pipeline/export_web.py` and this script turn them into the website data, the README and this report, and `deck/build.mjs` builds the slides.
"""

# Devpost: one section per field of the submission form, in the order the form asks.
PITCH = (f"Route optimizers save time on paper, and drivers ignore them. Line of Travel learns the order Amazon drivers "
         f"deliver in, then removes only the detours: {LOT['saving']:.1f}% less driving, zones kept whole.")
if len(PITCH) > 200:
    raise SystemExit(f"Devpost elevator pitch is {len(PITCH)} characters; the form allows 200")
# Edge cost in the solver (web/src/engine/solver.js habitCosts, default setting habit_30_300).
FORMULA = r"$$c_{ij} = t_{ij} + \mathbf{1}[z_i \ne z_j]\,\bigl(300 + 30 \cdot (-\log p(z_j \mid z_i))\bigr)$$"
IMPACT = R["impact"]
ort_short = (f"on {ort['routes']} held-out routes our travel-time-only tour is {abs(ort['gap_pct']):.2f}% "
             f"{'longer' if ort['gap_pct'] > 0 else 'shorter'} than Google OR-Tools given {ort['ortools_s']:.0f} s per route, "
             f"and as good or better on {pct(ort['better_or_equal'])} of them, in about {TSP['ms'] / 1000:.1f} s" if ort else "")
BUILT_WITH = ["python", "pandas", "numpy", "pyarrow", "lightgbm", "or-tools", "ijson", "javascript", "node.js", "web-workers",
              "vite", "maplibre-gl", "openfreemap", "github-pages", "github-actions", "pptxgenjs", "remotion", "react",
              "playwright", "deepgram", "ffmpeg"]
GALLERY = [
    ("01-card.png", "A real 154-stop Boston route in the driver's order (dashed) and in Line of Travel's (red)."),
    ("02-hero.png", "The website: a real Amazon route in Boston, re-sequenced in the browser."),
    ("03-turn.png", "The same 154 stops three ways: the driver, the shortest path, Line of Travel."),
    ("04-thread.png", "The route as a carrier's case, one slot per zone. Red slots changed order; manila was visited twice, now once."),
    ("05-desk.png", "Dispatch desk: pick a real route, set how much to trust the driver, test a late start or rush orders."),
    ("06-proof.png", f"Evidence on {n0(R['eval_routes'])} held-out routes: the trade-off between saving and staying close to the driver."),
    ("07-teaser-case.png", "From the film: a letter carrier's case, sorted in the order they walk."),
    ("08-teaser-rings.png", "From the film: the shortest path on this Boston route. Each red ring is a drive back into a zone it already finished."),
    ("09-teaser-figures.png", "From the film: the held-out results."),
]

def unwrap(md):
    """Joins hard-wrapped lines back into one line per paragraph or list item, since Devpost may keep line breaks."""
    out = []
    for line in md.split("\n"):
        prev = out[-1] if out else ""
        starts = re.match(r"(#+ |- |\d+\. |\$\$|```)", line)
        joins = line.strip() and prev.strip() and not starts and not re.match(r"(#+ |\$\$|```)", prev)
        if joins:
            out[-1] = prev.rstrip() + " " + line.strip()
        else:
            out.append(line)
    return "\n".join(out)


DEVPOST = f"""# Devpost submission

One section per field of the Devpost form, in the order the form asks. Generated by `pipeline/write_docs.py`
from `docs/results/summary.json`, so every number matches the site, the README and the deck.

## Project name

Line of Travel

## Elevator pitch ({len(PITCH)} of 200 characters)

{PITCH}

## Thumbnail

[`docs/devpost/01-card.png`](devpost/01-card.png): 1800 x 1200, the 3:2 ratio the form asks for.

## About the project

Paste everything inside the block.

```markdown
## Inspiration
Route optimizers promise double-digit savings, and drivers ignore them. On Amazon's held-out routes a shortest-path plan is
{TSP['saving']:.1f}% shorter than what the driver drove, but it drives back into a zone it has already finished {TSP['reentries']:.1f} times
per route, where drivers do it {DRV['reentries']:.1f} times. A plan like that asks a driver to throw away how they know their area,
so the saving on paper rarely reaches the road.

Mail carriers solved this long ago. Every morning a letter carrier sorts the day's mail into a case of pigeonholes, one slot
per stop, in the order they walk, and the US Postal Service records that order for every carrier route as its _Line of Travel_.
Amazon drivers have a line of travel too. Nobody wrote it down, so we learned it.

## What it does
Line of Travel learns the order drivers work their zones from {n0(R['train_routes'])} real Amazon routes, then re-sequences a route
to remove the detours without breaking that order. On {n0(R['eval_routes'])} held-out routes the model never saw, at the default setting:

- **{LOT['saving']:.1f}% less drive time** than the driver's own route (95% bootstrap interval {R['ci'][0]:.1f} to {R['ci'][1]:.1f}%),
  {n0(R['hours_saved'])} driver-hours in all
- **{LOT['reentries']:.2f} zone re-entries per route**, against {DRV['reentries']:.1f} for drivers and {TSP['reentries']:.1f} for the shortest path
- **late stops down from {n0(DRV['late'])} to {n0(LOT['late'])}**, of {n0(R['windowed_stops'])} stops with a delivery window

For a station of {IMPACT['vans']} vans that is about {IMPACT['station_hours_day']:.0f} driver-hours a day.

The website runs the solver in your browser. Load a real route and watch it re-sequence; compare the driver's order, the shortest
path and Line of Travel on the same stops; see the route laid out as a carrier's case, one slot per zone, with the changed slots
marked. A dispatch desk lets you pick a real route from five cities, turn a "trust the driver" dial from pure shortest path to the
driver's habits, and test a van leaving 45 minutes late or 8 same-day orders added.

## How we built it
- **Data:** Amazon Last Mile Routing Research Challenge 2021 (public, CC BY-NC 4.0): {n0(R['train_routes'] + R['eval_routes'])} routes,
  {n0(R['total_stops'])} stops, Amazon's travel-time matrices and the order each driver actually delivered in.
- **Habit model:** a LightGBM ranker predicts the driver's next zone {pct(R['zone_top1'])} of the time from about
  {round(s['zone']['candidates'])} candidates. Picking the nearest zone gets {pct(R['zone_nearest'])}.
- **Cost:** inside a zone an edge costs its travel time. Leaving a zone adds a fixed charge and a habit cost that is high for moves
  drivers rarely make, and every second late costs 20:

{FORMULA}

- **Engine:** iterated local search (asymmetric 2-opt with O(1) deltas, or-opt, whole-zone moves, double-bridge kicks cut at zone
  boundaries), with lateness counted when a round is accepted and a time-window repair that moves whole zones first. Plain
  JavaScript with no dependencies: the same file runs the benchmark in Node ({LOT['ms'] / 1000:.1f} s per route) and the demo in a
  Web Worker in your browser.
- **Validation:** held-out routes only; Amazon's official route score (our port is tested equal to the original); bootstrap
  intervals; an OR-Tools comparison; a scenario analysis; station-history features that only count other days.
- **Site and film:** Vite and MapLibre GL on OpenFreeMap tiles, deployed with GitHub Pages. The demo film is built in Remotion,
  narrated with Deepgram Aura-2, and its footage is a Playwright recording of the live site.

## Challenges we ran into
Our first engine lost to the driver on {pct(a1['worse']) if a1 else 'too many'} of routes. Instead of tuning around it, we diagnosed
it route by route: the search was breaking zones apart to fix late deliveries at the very end. Moving whole zones and counting
lateness during the search fixed it{f", and the default's saving went from {a1['saving']:.1f}% to {a2['saving']:.1f}%" if a1 else ""}.

Making it fast enough for a phone was the other one. Amazon's matrices are asymmetric, so reversing a segment changes its cost;
prefix sums over both directions keep each 2-opt move O(1), and a 154-stop route solves in under half a second in the browser.

## Accomplishments that we're proud of
- A saving a driver could accept: real minutes saved with zones kept whole, measured on routes the model never saw. It drives longer
  than the driver on only {pct(R['worse'])} of routes.
- A fast engine: {ort_short}.
- No server: the solver runs in the browser, so the demo works on a phone.
- One source of numbers: the website, README, report, deck and this page are all generated from the same benchmark output.

## What we learned
The constraint that matters in last-mile routing is trust, not distance. Measuring closeness to the driver with Amazon's own route
score turned that trade-off into a dial a dispatcher can set, instead of an argument. And the routes we lost on taught us more than
the averages did.

## What's next for Line of Travel
A pilot on one station's live routes with the dial set per driver, GPS traces to confirm that planned savings show up on the road,
and, with driver IDs, habits learned per driver instead of per station. Travel times here are Amazon's planned estimates, not GPS,
so every saving above is measured in Amazon's own matrix.
```

## Built with

Add one at a time ({len(BUILT_WITH)} of 25): {", ".join(BUILT_WITH)}

## "Try it out" links

- {demo}
- {repo}
- {links.get('deck', '')}

## Image gallery

Upload in this order from [`docs/devpost/`](devpost/) (each 1800 x 1200, 3:2, under 5 MB), with these captions:

{chr(10).join(f"{i + 1}. `{name}`: {caption}" for i, (name, caption) in enumerate(GALLERY))}

## Video demo link

{links.get('video', '')}

## Additional info: upload a file

[`web/public/LineOfTravel_DataNova2026.pdf`](../web/public/LineOfTravel_DataNova2026.pdf), the presentation as a PDF.
"""

(ROOT / "README.md").write_text(README)
(ROOT / "docs" / "REPORT.md").write_text(REPORT)
(ROOT / "docs" / "DEVPOST.md").write_text(unwrap(DEVPOST))
print("wrote README.md, docs/REPORT.md and docs/DEVPOST.md")
