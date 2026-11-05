# Line of Travel: technical report

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
| Routes | 6,112 | 3,052 |
| Stops | 904,527 | 433,231 |

Seventeen stations in Los Angeles, Seattle, Boston, Chicago and Austin. For every route the data gives each stop's location, planning zone
(for example `A-2.2A`), packages with dimensions, service times and optional delivery windows, the route's travel-time matrix in seconds, and
the order the driver actually delivered in. Training routes also carry Amazon's High, Medium or Low quality label.

Preparation (`pipeline/ingest.py`):

- Travel matrices are stored as one float32 memory-mapped array, so a route's matrix is a slice, not a JSON parse.
- A stop's delivery window is the intersection of its packages' windows, in seconds after departure. 6.6% of held-out stops (28,354) have one.
- A stop's service time is the sum of its packages' planned service times.
- Stops without a zone take the zone of their nearest zoned stop; the station is its own zone.

The driver finishes 94% of zones in a single visit (about 19 zones per route), which is the regularity this project builds on.

## 3. Method

### 3.1 Next-zone model (`pipeline/zone_model.py`)

For each zone a driver leaves, a LightGBM lambdarank model ranks every unvisited zone of the route as the next one. Features:

- **Geometry:** distance between zone centres, its rank among the candidates, and its ratio to the nearest candidate.
- **Zone IDs:** same cluster, same block, signed and absolute steps in block, row and column of Amazon's zone code.
- **Station history:** how often drivers at the same station moved from this zone to the candidate (and back) on other days. For a training route, its own date is excluded, so the model never sees the answer.

Trained on the training routes (learning rate 0.05, 63 leaves, 400 rounds). On 66,621 held-out zone-to-zone moves with about
21 candidates each, top-1 accuracy is **68%**, against 63% for station history alone and
35% for the nearest zone. A move's habit cost is `−log p` from the model's softmax over candidates.

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

- **Held-out:** the zone model trains on Amazon's training routes; all results are on the 3,052 evaluation routes.
- **Drive time:** the sum of matrix travel times along the tour, including the legs from and to the station. All methods use the same matrix.
- **Late stops:** stops reached after their window closes, with the van leaving at the planned departure time.
- **Zone re-entries:** times a van drives into a zone it has already left.
- **Amazon score:** the challenge's own metric (sequence deviation × edit distance with real-time penalties), 0 = identical to the driver. Our port in `web/src/engine/score.js` and `pipeline/scoring.py` matches the official scorer exactly on 40 randomised routes (`pipeline/tests/test_scoring.py`).
- **Uncertainty:** 95% bootstrap intervals over routes (2,000 resamples).

## 5. Results

| Method | Drive time vs driver | 95% interval | Amazon score (0 = driver) | Zone re-entries per route | Late stops |
|---|---:|---:|---:|---:|---:|
| Driver's own order | baseline |  | 0 | 1.38 | 469 |
| Nearest neighbour | +2.2% |  | 0.105 | 20.98 | 2,027 |
| Shortest path (our engine, travel time only) | −11.3% | 11.2 to 11.5% | 0.080 | 15.72 | 1 |
| Line of Travel, zones only | −8.0% |  | 0.050 | 0.00 | 2 |
| **Line of Travel, default** | −5.9% | 5.8 to 6.1% | 0.032 | 0.01 | 1 |

### 5.1 The trust dial

| Setting (habit weight w, crossing charge) | Drive time vs driver | Amazon score | Zone re-entries per route | Late stops |
|---|---:|---:|---:|---:|
| Zones only (0, 600 s) | −8.0% | 0.050 | 0.00 | 2 |
| Default (30, 300 s) | −5.9% | 0.032 | 0.01 | 1 |
| High trust (60, 600 s) | −5.2% | 0.030 | 0.00 | 4 |
| 120, 1200 s (not on the dial: high trust beats it on both counts) | −4.7% | 0.031 | 0.00 | 2 |
| Maximum trust (300, 1200 s) | −4.3% | 0.030 | 0.00 | 5 |

### 5.2 Route by route

At the default setting the median route saves 5.5%. 2.4% of routes drive longer than the driver did, and 0.2% by more than 4%.

### 5.3 Amazon's quality labels

Even routes Amazon rated High have about 11% to recover. Median drive time a shortest path recovers, by Amazon's own route-quality label, 6,112 training routes. The labels do not predict the waste, so the saving is not confined to a few badly run routes.

| Amazon label | Routes | Median drive time recoverable by a shortest path |
|---|---:|---:|
| High | 2,718 routes | 10.8% |
| Medium | 3,292 routes | 10.4% |
| Low | 102 routes | 10.6% |

### 5.4 Solver quality

On 200 held-out routes, our engine's travel-time-only tour is 2.26% shorter than Google OR-Tools (guided local search, 5 s per route), and as good or better on 96% of them, using about 0.3 s.

## 6. Ablation: the first engine and what fixed it

Our first engine lost to the driver on too many routes (18% at the default setting). A diagnosis script (`bench/diag_losses.mjs`) compared both tours under our own objective and
found the search, not the cost model, at fault on almost every losing route. Two causes:

1. Once leaving a zone is expensive, single-stop moves cannot reorder zones, so the zone order got stuck. Fix: zone-block moves and zone-boundary kicks.
2. Time windows were only handled at the end, by a repair that pulled single stops out of their zones to save a late delivery. Fix: count lateness when accepting search rounds, and repair by moving whole zones first.

| Method | Engine | Drive time vs driver | Amazon score | Zone re-entries | Routes longer than the driver | Longer by more than 4% |
|---|---|---:|---:|---:|---:|---:|
| Line of Travel, default | first | −3.3% | 0.047 | 0.83 | 18% | 9.7% |
| Line of Travel, default | current | −5.9% | 0.032 | 0.01 | 2.4% | 0.2% |
| Line of Travel, zones only | first | −4.7% | 0.061 | 0.88 | 14% | 9.2% |
| Line of Travel, zones only | current | −8.0% | 0.050 | 0.00 | 0.5% | 0.0% |
| Shortest path | first | −9.1% | 0.088 | 16.94 | 7.5% | 4.8% |
| Shortest path | current | −11.3% | 0.080 | 15.72 | 0.2% | 0.2% |

The first engine's results are kept in `docs/results/v1/`; `node bench/run.mjs --engine v1` reproduces them.

## 7. Scenario analysis

`bench/scenarios.mjs` runs the same code as the website's what-if controls on 400 held-out routes (every seventh route, which spreads them across all stations):

- **Normal day:** as planned.
- **Late start:** the van leaves 45 minutes late, so every window closes 45 minutes sooner relative to departure.
- **Rush orders:** 8 same-day orders appear about 100 m from existing stops, each due within 4 hours. The driver baseline inserts each one where it adds the least travel time, which is what a driver handed an extra parcel would do.

| Scenario | Drive time, Line of Travel | Drive time, shortest path | Day length, Line of Travel | Late stops: driver / Line of Travel / shortest path | Zone re-entries per route: Line of Travel / shortest path |
|---|---:|---:|---:|---:|---:|
| Normal day | −6.2% | −11.6% | −1.4% | 61 / 0 / 0 | 0.01 / 15.86 |
| Van leaves 45 min late | −5.7% | −11.2% | −1.9% | 227 / 0 / 0 | 0.01 / 16.05 |
| 8 same-day orders added | +5.3% | −4.9% | +1.5% | 1,809 / 0 / 0 | 1.75 / 20.48 |

- **Late start:** the saving holds (−5.7% against −6.2% on a normal day), and late stops go from 227 in the driver's order to 0.
- **Rush orders:** the driver's order with each order slotted in by hand misses 1,809 deadlines. Line of Travel misses 0, and pays for it with 5.3% more driving than that baseline. The shortest path also meets every deadline with −4.9% drive time, but by re-entering 20.5 zones per route against Line of Travel's 1.75. Same-day orders are where a dispatcher would turn the trust dial down: the default setting prices every unusual zone switch as a habit the driver would have to break.

## 8. Impact estimate

At the default setting a route saves about 11.6 minutes of driving. A station running 100 vans saves about
19.4 driver-hours a day; at the US Bureau of Labor Statistics 2025 median pay for delivery truck drivers ($21.13/h)
over 250 working days, about $102,451 a year, before fuel, vehicle wear and emissions. The estimate assumes the
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
