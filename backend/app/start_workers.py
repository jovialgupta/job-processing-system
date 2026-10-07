import multiprocessing
import os

from app.worker import run_worker, recover_stuck_jobs

NUM_WORKERS = int(os.getenv("NUM_WORKERS", "3"))  # was hardcoded 3


if __name__ == "__main__":
    recover_stuck_jobs()  # re-queue jobs a crashed worker left behind

    workers = []
    for i in range(NUM_WORKERS):
        p = multiprocessing.Process(target=run_worker, name=f"Worker-{i + 1}")
        p.start()
        workers.append(p)
        print(f"Worker-{i + 1} started | PID: {p.pid}", flush=True)

    for p in workers:
        p.join()
