# Line of Travel

**Learns the order Amazon drivers actually deliver in, then removes only the detours.**

DataNova 2026 Global Data-thon, problem DN-OR-01 (last-mile delivery route optimization). Solo entry by Sanchay Singh.

- Live demo: https://sanchay117.github.io/line-of-travel/
- Demo film, 2:55: https://youtu.be/z7Sm4eI2i9E
- Presentation: https://docs.google.com/presentation/d/1U-HzbrU4MRka3BVCsoQbG4Qd8OcPVzdB/edit?usp=sharing (source: [`deck/LineOfTravel_DataNova2026.pptx`](deck/LineOfTravel_DataNova2026.pptx))
- Technical report, validation and scenario analysis: [`docs/REPORT.md`](docs/REPORT.md)

## The idea

A shortest-path optimizer cuts drive time on paper, but it ignores the zones drivers work in: on Amazon's held-out routes it re-enters
15.7 zones per route, where drivers re-enter 1.4. Drivers have little reason to follow a plan like that, so the saving on paper is unlikely to reach the road.

Mail carriers solved this long ago. Each morning a letter carrier sorts the day's mail into a case of pigeonholes in walking order, and the US Postal
Service records that order for every carrier route as its *Line of Travel*. Amazon drivers have a line of travel too. Nobody wrote it down, so we learned
it from 6,112 of their routes, then optimise only within it.

## Results on 3,052 held-out routes

| Method | Drive time vs driver | 95% interval | Amazon score (0 = driver) | Zone re-entries per route | Late stops |
|---|---:|---:|---:|---:|---:|
| Driver's own order | baseline |  | 0 | 1.38 | 469 |
| Nearest neighbour | +2.2% |  | 0.105 | 20.98 | 2,027 |
| Shortest path (our engine, travel time only) | −11.3% | 11.2 to 11.5% | 0.080 | 15.72 | 1 |
| Line of Travel, zones only | −8.0% |  | 0.050 | 0.00 | 2 |
| **Line of Travel, default** | −5.9% | 5.8 to 6.1% | 0.032 | 0.01 | 1 |

The default setting saves 592 driver-hours over the held-out routes, about 11.6 minutes per route
(median 5.5% per route), and stays closer to the driver's real order than shortest path, nearest neighbour or zones-only routing. Only 2.4% of routes drive longer than the driver did.

## How it works

1. **Read the routes.** 6,112 training routes with the order each driver actually delivered.
2. **Learn the next zone.** A LightGBM ranker picks the driver's next zone 68% of the time, from about 21 candidates (nearest zone: 35%).
3. **Price every move.** `cost(i → j) = travel(i, j) + [new zone] × (crossing + w × −log p(zone j | zone i))`.
4. **Re-sequence.** Iterated local search (2-opt, or-opt, whole-zone moves, double-bridge kicks) with lateness in the acceptance rule and a time-window repair, given 0.3 s per route in the benchmark. The same JavaScript file runs the benchmark in Node and the demo in the browser, where a fixed number of search rounds takes 0.4 to 0.7 s per route on an Apple M4 Pro.

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
