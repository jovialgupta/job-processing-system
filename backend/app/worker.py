import redis
from .database import SessionLocal
from . import models
import time

r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True,
    socket_timeout=None
)


def run_worker():
    while True:
        job_id = r.brpop("job_queue")[1]

        db = SessionLocal()

        job = db.query(models.Job).filter(
            models.Job.id == int(job_id)
        ).first()

        if job is None:
            print(f"Job {job_id} not found")
            db.close()
            continue

        job.status = "PROCESSING"
        db.commit()

        print(f"Processing job {job_id}")

        time.sleep(5)

        job.status = "COMPLETED"
        job.result = "File created successfully"
        db.commit()

        print(f"Job {job.id} completed")

        db.close()


if __name__ == "__main__":
    run_worker()
