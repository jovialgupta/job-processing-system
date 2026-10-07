"""
Benchmark for the Job Processing System.

Usage (API + workers already running, ARTIFICIAL_DELAY_SECONDS unset/0):
    pip install requests
    python benchmark.py --pdf sample.pdf --jobs 30

Run it once with NUM_WORKERS=1 and once with NUM_WORKERS=3 (restart workers
between runs) and compare. Use a BIG PDF (50-200 pages) so processing takes
long enough to measure. Run each setting 3 times and report the median.
"""
import argparse
import statistics
import time

import requests

API = "http://localhost:8000"
DONE = {"COMPLETED", "FAILED"}


def pct(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int(round(p / 100 * (len(values) - 1))))]


def parse(ts):
    from datetime import datetime
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--jobs", type=int, default=30)
    ap.add_argument("--api", default=API)
    args = ap.parse_args()

    with open(args.pdf, "rb") as f:
        data = f.read()

    # 1) submit N jobs, timing each API response
    submit_ms, ids = [], []
    t0 = time.perf_counter()
    for i in range(args.jobs):
        s = time.perf_counter()
        resp = requests.post(
            f"{args.api}/jobs/",
            files={"file": (f"bench_{i}.pdf", data, "application/pdf")},
        )
        submit_ms.append((time.perf_counter() - s) * 1000)
        resp.raise_for_status()
        ids.append(resp.json()["id"])

    # 2) wait until every job is COMPLETED/FAILED
    pending = set(ids)
    jobs = {}
    while pending:
        rows = requests.get(f"{args.api}/jobs/", params={"limit": 1000}).json()
        for row in rows:
            if row["id"] in pending and row["status"] in DONE:
                jobs[row["id"]] = row
                pending.discard(row["id"])
        time.sleep(0.2)
    total_s = time.perf_counter() - t0

    # 3) compute metrics from DB timestamps
    done = [j for j in jobs.values() if j["status"] == "COMPLETED"]
    failed = len(jobs) - len(done)
    proc = [(parse(j["completed_at"]) - parse(j["started_at"])).total_seconds() * 1000 for j in done]
    wait = [(parse(j["started_at"]) - parse(j["created_at"])).total_seconds() * 1000 for j in done]
    retries = sum(j["retry_count"] for j in jobs.values())

    avg_submit = statistics.mean(submit_ms)
    avg_proc = statistics.mean(proc) if proc else 0

    print("\n========== RESULTS ==========")
    print(f"Jobs: {len(jobs)} | completed: {len(done)} | failed: {failed} | retries used: {retries}")
    print(f"Total wall time:        {total_s:.2f} s")
    print(f"Throughput:             {len(done) / total_s:.2f} jobs/sec")
    print(f"Submit latency (API):   avg {avg_submit:.0f} ms | p95 {pct(submit_ms, 95):.0f} ms")
    if proc:
        print(f"Processing time/job:    avg {avg_proc:.0f} ms | p95 {pct(proc, 95):.0f} ms")
        print(f"Queue wait/job:         avg {statistics.mean(wait):.0f} ms | p95 {pct(wait, 95):.0f} ms")
        inline = avg_submit + avg_proc
        cut = (1 - avg_submit / inline) * 100
        print(f"\nIf processed INLINE, response ~ {inline:.0f} ms (submit + processing)")
        print(f"Async response is ~{cut:.0f}% faster for the client.")


if __name__ == "__main__":
    main()