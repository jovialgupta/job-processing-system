import redis
import multiprocessing
import os
from datetime import datetime
import pymupdf

from .database import SessionLocal
from . import models


r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True,
    socket_timeout=None
)


def run_worker():
    while True:
        # Wait for a job in Redis
        job_id = r.brpop("job_queue")[1]

        db = SessionLocal()
        job = None

        try:
            # Find the job in the database
            job = db.query(models.Job).filter(
                models.Job.id == int(job_id)
            ).first()

            if job is None:
                print(f"Job {job_id} not found")
                continue

            # Find uploaded file
            file_path = os.path.join("uploads", job.filename)

            if not os.path.exists(file_path):
                raise FileNotFoundError(
                    f"File not found: {job.filename}"
                )

            # Mark job as processing
            job.status = "PROCESSING"
            db.commit()

            print(
            f"{multiprocessing.current_process().name} | "
            f"PID: {os.getpid()} | "
            f"Processing job {job_id}",
            flush=True
)

            # Open PDF
            doc = pymupdf.open(file_path)

            # Get page count
            page_count = len(doc)

            # Extract text from every page
            extracted_text = ""

            for page in doc:
                extracted_text += page.get_text()

            doc.close()

            # Make sure PDF contains text
            if not extracted_text.strip():
                raise ValueError(
                    "No text could be extracted from the PDF"
                )

            # Job completed successfully
            job.status = "COMPLETED"
            job.result = (
                f"PDF processed successfully. "
                f"Pages: {page_count}. "
                f"Characters extracted: {len(extracted_text)}."
            )
            job.completed_at = datetime.utcnow()

            db.commit()

            print(f"Job {job.id} completed")

        except Exception as e:
            if job is not None:
                job.status = "FAILED"
                job.result = f"Processing failed: {str(e)}"
                db.commit()

            print(f"Job {job_id} failed: {e}")

        finally:
            db.close()


if __name__ == "__main__":
    run_worker()