"""Amazon Last Mile Routing Research Challenge route score, ported for speed.

The official scorer (MIT-CAVE/rc-cli, scoring/score.py) computes, per route:

    score = SeqDev(actual, proposed) * ERP_per_edit(actual, proposed, normalized_times)

Lower is better; 0 means the proposed sequence equals the driver's actual sequence.
The official ERP is a memoized recursion over tuple suffixes (O(n^3) memory). This module
computes the same quantity with an index-based dynamic program, keeping the official
tie-breaking order for the edit count (substitute, then delete, then insert).
`tests/test_scoring.py` checks equality against a literal transcription of the original.
"""
from __future__ import annotations

import numpy as np

GAP = 1000.0


def normalize_matrix(t: np.ndarray) -> np.ndarray:
    """z-score every entry of the travel-time matrix, then shift so the minimum is 0."""
    z = (t - t.mean()) / t.std()
    return z - z.min()


def seq_dev(actual: list[int], sub: list[int]) -> float:
    """Sequence deviation on the inner stops (station removed at both ends)."""
    a = actual[1:-1]
    s = sub[1:-1]
    pos = {stop: i for i, stop in enumerate(a)}
    comp = [pos[x] for x in s]
    total = sum(abs(comp[k] - comp[k - 1]) - 1 for k in range(1, len(comp)))
    n = len(a)
    return (2.0 / (n * (n - 1))) * total


def erp_per_edit(actual: list[int], sub: list[int], norm: np.ndarray, g: float = GAP) -> float:
    """Edit distance with real penalty, divided by the number of edits it used."""
    n, m = len(actual), len(sub)
    d = np.zeros((n + 1, m + 1))
    c = np.zeros((n + 1, m + 1), dtype=np.int64)
    # Base cases: one suffix empty.
    for i in range(n - 1, -1, -1):
        d[i, m] = d[i + 1, m] + g
        c[i, m] = n - i
    for j in range(m - 1, -1, -1):
        d[n, j] = d[n, j + 1] + g
        c[n, j] = m - j
    for i in range(n - 1, -1, -1):
        ai = actual[i]
        row = norm[ai]
        for j in range(m - 1, -1, -1):
            sj = sub[j]
            o1 = d[i + 1, j + 1] + row[sj]
            o2 = d[i + 1, j] + g
            o3 = d[i, j + 1] + g
            best = min(o1, o2, o3)
            d[i, j] = best
            if best == o1:
                c[i, j] = c[i + 1, j + 1] + (0 if ai == sj else 1)
            elif best == o2:
                c[i, j] = c[i + 1, j] + 1
            else:
                c[i, j] = c[i, j + 1] + 1
    count = c[0, 0]
    return 0.0 if count == 0 else float(d[0, 0] / count)


def route_score(actual: list[int], sub: list[int], times: np.ndarray) -> float:
    """Score one route. Sequences are stop indices that start at the station and
    end by returning to it (the official route2list appends the start again)."""
    if len(actual) != len(sub) or set(actual) != set(sub) or actual[0] != sub[0]:
        raise ValueError("invalid proposed sequence")
    norm = normalize_matrix(times)
    return seq_dev(actual, sub) * erp_per_edit(actual, sub, norm)
