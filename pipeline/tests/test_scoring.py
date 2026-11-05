"""Check the fast scorer against a literal transcription of the official recursive scorer.

The reference functions below follow MIT-CAVE/rc-cli scoring/score.py line for line
(dict-based matrix, memoized tuple recursion), so any drift in the port shows up here.
Run: .venv/bin/python -m pytest pipeline/tests -q   (or run this file directly)
"""
import random
import sys
import pathlib

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from scoring import route_score  # noqa: E402

sys.setrecursionlimit(100000)


def ref_normalize(mat):
    vals = [mat[o][d] for o in mat for d in mat[o]]
    avg, std = np.mean(vals), np.std(vals)
    new = {o: {d: (mat[o][d] - avg) / std for d in mat[o]} for o in mat}
    mn = min(v for o in new for v in new[o].values())
    return {o: {d: new[o][d] - mn for d in new[o]} for o in new}


def ref_erp(actual, sub, matrix, g=1000, memo=None):
    if memo is None:
        memo = {}
    key = (tuple(actual), tuple(sub))
    if key in memo:
        return memo[key]
    if len(sub) == 0:
        d, count = g * len(actual), len(actual)
    elif len(actual) == 0:
        d, count = g * len(sub), len(sub)
    else:
        ha, hs, ra, rs = actual[0], sub[0], actual[1:], sub[1:]
        s1, c1 = ref_erp(ra, rs, matrix, g, memo)
        s2, c2 = ref_erp(ra, sub, matrix, g, memo)
        s3, c3 = ref_erp(actual, rs, matrix, g, memo)
        o1 = s1 + matrix[ha][hs]
        o2 = s2 + g
        o3 = s3 + g
        d = min(o1, o2, o3)
        if d == o1:
            count = c1 if ha == hs else c1 + 1
        elif d == o2:
            count = c2 + 1
        else:
            count = c3 + 1
    memo[key] = (d, count)
    return d, count


def ref_seq_dev(actual, sub):
    actual, sub = actual[1:-1], sub[1:-1]
    comp = [actual.index(i) for i in sub]
    s = sum(abs(comp[k] - comp[k - 1]) - 1 for k in range(1, len(comp)))
    n = len(actual)
    return (2 / (n * (n - 1))) * s


def ref_score(actual, sub, mat):
    norm = ref_normalize(mat)
    total, count = ref_erp(actual, sub, norm)
    erp = 0 if count == 0 else total / count
    return ref_seq_dev(actual, sub) * erp


def test_matches_reference():
    rng = random.Random(7)
    for trial in range(40):
        n = rng.randint(4, 30)
        pts = np.array([[rng.random(), rng.random()] for _ in range(n)])
        times = np.sqrt(((pts[:, None] - pts[None]) ** 2).sum(-1)) * 1000
        ids = [chr(65 + i // 26) + chr(65 + i % 26) for i in range(n)]
        mat = {ids[i]: {ids[j]: float(times[i, j]) for j in range(n)} for i in range(n)}
        inner = list(range(1, n))
        actual = [0] + rng.sample(inner, len(inner)) + [0]
        sub = [0] + rng.sample(inner, len(inner)) + [0]
        if trial % 5 == 0:
            sub = list(actual)
        ours = route_score(actual, sub, times)
        ref = ref_score([ids[i] for i in actual], [ids[i] for i in sub], mat)
        assert abs(ours - ref) < 1e-9, (trial, ours, ref)


if __name__ == "__main__":
    test_matches_reference()
    print("scoring port matches the official reference on 40 random routes")
