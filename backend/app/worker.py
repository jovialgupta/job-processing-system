import redis
import os
from datetime import datetime
import pymupdf
import time

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
        job_id = r.brpop("job_queue")[1]
        time.sleep(5) 
        db = SessionLocal()
        job = None

        try:
            job = db.query(models.Job).filter(
                models.Job.id == int(job_id)
            ).first()

            if job is None:
                print(f"Job {job_id} not found")
                continue

            # Mark job as processing
            job.status = "PROCESSING"
            db.commit()
            import time
            print(f"Processing job {job_id}")
            time.sleep(10)
            

            # Find uploaded PDF
            file_path = os.path.join("uploads", job.filename)

            if not os.path.exists(file_path):
                raise FileNotFoundError(
                    f"File not found: {job.filename}"
                )

            # Open PDF
            doc = pymupdf.open(file_path)

            # Extract text from every page
            extracted_text = ""

            for page in doc:
                extracted_text += page.get_text()

            doc.close()

            # Make sure the PDF actually contained text
            if not extracted_text.strip():
                raise ValueError(
                    "No text could be extracted from the PDF"
                )

            # Save extracted text as the result
            job.status = "COMPLETED"
            job.result = extracted_text[:1000]
            job.completed_at = datetime.utcnow()

            db.commit()

            print(f"Job {job.id} completed")

        except Exception as e:
            if job is not None:
                job.status = "FAILED"
                job.result = str(e)
                db.commit()

            print(f"Job {job_id} failed: {e}")

        finally:
            db.close()


if __name__ == "__main__":
    run_worker()