# Devpost write-up (paste into the project page)

**Tagline:** Learns the order Amazon drivers actually deliver in, then removes only the detours.

## Inspiration
Route optimizers promise double-digit savings, and drivers ignore them. On Amazon's own held-out routes, a shortest-path plan is
11.3% shorter than what the driver drove, but it re-enters 16 delivery zones per route, where drivers re-enter about one.
Nobody drives that. Mail carriers solved this a century ago: they sort mail into a case in the order they walk, and the US Postal Service
records that order as the carrier's *Line of Travel*. We wanted the same thing for delivery vans.

## What it does
Line of Travel learns how drivers move between zones from 6,112 real Amazon routes, then re-sequences a route to remove
detours without breaking that order. On 3,052 held-out routes the default setting cuts drive time by 5.9%
(95% interval 5.8 to 6.1%), re-enters 0.01 zones per route, and cuts late stops from 469 to 1.
A dispatcher sets a trust dial between pure shortest path and the driver's habits, and can test a late start or same-day rush orders.

## How we built it
- **Data:** Amazon Last Mile Routing Research Challenge 2021 (public, CC BY-NC 4.0): 9,164 routes, 1,337,758 stops, travel-time matrices and the drivers' real sequences.
- **Habit model:** a LightGBM ranker predicts the driver's next zone 68% of the time from about 21 options (nearest zone: 35%).
- **Engine:** iterated local search on travel time plus a zone-crossing charge plus a habit cost of −log p, with whole-zone moves and lateness in the acceptance rule. Plain JavaScript: the same file runs the benchmark in Node (0.3 s per route) and the demo in the browser (0.4 to 0.7 s per route on a laptop).
- **Validation:** held-out routes only, Amazon's official route score (our port is tested equal to the original), bootstrap intervals, an OR-Tools check, and a scenario analysis.

## Challenges we ran into
Our first engine lost to the driver on 18% of routes. Instead of tuning around it, we diagnosed it route by route: the search was
breaking zones apart to fix late deliveries at the very end. Moving whole zones and counting lateness during the search fixed it, and the default's saving went from 3.3% to 5.9%.

## Accomplishments that we're proud of
A result a driver would accept: real minutes saved with zones kept whole, measured on routes the model never saw, and a demo anyone can run
on a phone, with the solver running in the browser rather than on a server.

## What we learned
The constraint that matters in last-mile routing is not distance, it is trust. Measuring closeness to the driver with Amazon's own metric made that trade-off visible and tunable.

## What's next
A pilot on one station's live routes, with the trust dial set per driver, and GPS traces to confirm that planned savings show up on the road.

## Built with
Python, pandas, PyArrow, LightGBM, OR-Tools, JavaScript, Web Workers, Vite, MapLibre GL, OpenFreeMap.
