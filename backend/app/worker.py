
import multiprocessing
import os
import time
from datetime import datetime, timezone

import pymupdf
import redis

from . import models
from .database import SessionLocal
from .redis_client import r, QUEUE, PROCESSING

MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
# Default 0 = real work only. Set >0 ONLY to simulate heavier jobs in demos,
# and say so if you quote benchmark numbers taken with it.
ARTIFICIAL_DELAY = float(os.getenv("ARTIFICIAL_DELAY_SECONDS", "0"))


class PermanentError(Exception):
    """Retrying will not help (bad file, no text, missing file)."""


def utcnow():
    return datetime.now(timezone.utc)


def extract_pdf(path: str):
    if not os.path.exists(path):
        raise PermanentError(f"File not found: {path}")

    try:
        doc = pymupdf.open(path)
    except Exception as e:
        raise PermanentError(f"Could not open PDF: {e}")

    try:
        pages = len(doc)
        text = "".join(page.get_text() for page in doc)
    finally:
        doc.close()

    if not text.strip():
        raise PermanentError("No text could be extracted from the PDF")

    return pages, len(text)


def finish(job_id: str):
    """Job is done (success OR final failure): remove it from the in-flight list."""
    r.lrem(PROCESSING, 1, job_id)


def requeue(job_id: str):
    """Atomically put the job back on the main queue and out of the in-flight list."""
    pipe = r.pipeline(transaction=True)
    pipe.lpush(QUEUE, job_id)
    pipe.lrem(PROCESSING, 1, job_id)
    pipe.execute()


def handle_failure(db, job, job_id: str, err: Exception):
    permanent = isinstance(err, PermanentError)
    job.error = str(err)

    if not permanent and job.retry_count < MAX_RETRIES:
        job.retry_count += 1
        job.status = "QUEUED"
        db.commit()
        requeue(job_id)
        print(f"Job {job_id} failed ({err}); retry {job.retry_count}/{MAX_RETRIES}", flush=True)
    else:
        job.status = "FAILED"
        job.result = f"Processing failed: {err}"
        job.completed_at = utcnow()
        db.commit()
        finish(job_id)
        print(f"Job {job_id} FAILED permanently: {err}", flush=True)


def run_worker():
    name = multiprocessing.current_process().name

    while True:
        # Atomically move the job from QUEUE -> PROCESSING.
        # If this worker crashes, the id is still in PROCESSING and can be recovered.
        try:
            job_id = r.blmove(
                QUEUE,
                PROCESSING,
                0,
                src="RIGHT",
                dest="LEFT"
            )
        except redis.exceptions.TimeoutError:
            continue
        except redis.exceptions.ConnectionError as e:
            print(
                f"{name}: Redis connection error: {e}",
                flush=True
            )
            time.sleep(2)
            continue

        db = SessionLocal()
   
        job = None
        try:
            job = db.get(models.Job, int(job_id))
            if job is None:
                print(f"{name}: job {job_id} not in DB, dropping", flush=True)
                finish(job_id)
                continue

            job.status = "PROCESSING"
            job.started_at = utcnow()
            db.commit()

            print(f"{name} (PID {os.getpid()}) processing job {job_id}", flush=True)

            if ARTIFICIAL_DELAY:
                time.sleep(ARTIFICIAL_DELAY)

            path = os.path.join("uploads", job.stored_filename or job.filename)
            pages, chars = extract_pdf(path)

            job.status = "COMPLETED"
            job.result = f"PDF processed successfully. Pages: {pages}. Characters extracted: {chars}."
            job.error = None
            job.completed_at = utcnow()
            db.commit()
            finish(job_id)

            print(f"{name}: job {job_id} completed", flush=True)

        except Exception as e:
            db.rollback()
            if job is not None:
                handle_failure(db, job, job_id, e)
            else:
                finish(job_id)
                print(f"{name}: job {job_id} error: {e}", flush=True)
        finally:
            db.close()


def recover_stuck_jobs():
    """Run ONCE at startup, before workers start.
    Anything still in PROCESSING belonged to a worker that died, so re-queue it."""
    stuck = r.lrange(PROCESSING, 0, -1)
    if not stuck:
        return

    db = SessionLocal()
    try:
        for job_id in stuck:
            job = db.get(models.Job, int(job_id))
            if job is not None and job.status in ("PROCESSING", "QUEUED"):
                job.status = "QUEUED"
                db.commit()
                requeue(job_id)
            else:
                finish(job_id)
        print(f"Recovered {len(stuck)} stuck job(s)", flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    recover_stuck_jobs()
    run_worker()