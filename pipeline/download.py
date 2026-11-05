"""Download the Amazon Last Mile Routing Research Challenge (2021) dataset.

Source: the public AWS Open Data bucket s3://amazon-last-mile-challenges (no account needed).
License: CC BY-NC 4.0, see data/raw/License.txt (downloaded alongside the data).
Large files are fetched as parallel byte ranges because a single S3 stream is slow.
"""
import concurrent.futures as cf
import os
import pathlib
import sys
import time
import urllib.request

BUCKET = "https://amazon-last-mile-challenges.s3.amazonaws.com/almrrc2021/"
RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"
CHUNK = 8 << 20  # 8 MB ranges
WORKERS = 24

FILES = [
    "License.txt",
    "Readme.txt",
    "almrrc2021-data-training/model_build_inputs/route_data.json",
    "almrrc2021-data-training/model_build_inputs/actual_sequences.json",
    "almrrc2021-data-training/model_build_inputs/invalid_sequence_scores.json",
    "almrrc2021-data-evaluation/model_apply_inputs/eval_route_data.json",
    "almrrc2021-data-evaluation/model_score_inputs/eval_actual_sequences.json",
    "almrrc2021-data-evaluation/model_score_inputs/eval_invalid_sequence_scores.json",
    "almrrc2021-data-training/model_build_inputs/package_data.json",
    "almrrc2021-data-evaluation/model_apply_inputs/eval_package_data.json",
    "almrrc2021-data-evaluation/model_apply_inputs/eval_travel_times.json",
    "almrrc2021-data-training/model_build_inputs/travel_times.json",
]


def get_range(url: str, start: int, end: int, fd: int) -> int:
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) != end - start + 1:
                raise IOError("short read")
            os.pwrite(fd, data, start)
            return len(data)
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise IOError(f"range {start}-{end} failed")


def fetch(key: str) -> None:
    url = BUCKET + key
    dest = RAW / key.split("/")[-1]
    with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
        size = int(r.headers["Content-Length"])
    if dest.exists() and dest.stat().st_size == size:
        print(f"skip  {dest.name} ({size/1e6:.1f} MB)", flush=True)
        return
    t0 = time.time()
    tmp = dest.with_suffix(dest.suffix + ".part")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    try:
        os.ftruncate(fd, size)
        ranges = [(s, min(s + CHUNK, size) - 1) for s in range(0, size, CHUNK)]
        with cf.ThreadPoolExecutor(WORKERS) as pool:
            list(pool.map(lambda r: get_range(url, r[0], r[1], fd), ranges))
    finally:
        os.close(fd)
    tmp.rename(dest)
    secs = time.time() - t0
    print(f"done  {dest.name} ({size/1e6:.1f} MB in {secs:.0f}s, {size/1e6/max(secs,1e-3):.1f} MB/s)", flush=True)


if __name__ == "__main__":
    RAW.mkdir(parents=True, exist_ok=True)
    for key in FILES if len(sys.argv) == 1 else sys.argv[1:]:
        fetch(key)
    print("ALL DONE", flush=True)
