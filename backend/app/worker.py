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
while True:
    job_id = r.brpop("job_queue")[1]
    db = SessionLocal()

    job = db.query(models.Job).filter(
        models.Job.id == int(job_id)
    ).first()
    job.status = "PROCESSING"
    db.commit()
    print(f"Processing job {job_id}")

    time.sleep(5)
    job.status="COMPLETED"
    job.result="File created successfully"
    db.commit()

    print(f"job{job.id} completed")
    db.close()

