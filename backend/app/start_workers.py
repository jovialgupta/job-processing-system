import multiprocessing
import os

from app.worker import run_worker


if __name__ == "__main__":
    workers = []

    for i in range(3):
        process = multiprocessing.Process(
            target=run_worker,
            name=f"Worker-{i + 1}"
        )

        process.start()
        workers.append(process)

        print(
            f"Worker-{i + 1} started | PID: {process.pid}",
            flush=True
        )

    for process in workers:
        process.join()