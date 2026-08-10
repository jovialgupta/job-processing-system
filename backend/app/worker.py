import redis
from .database import SessionLocal
from . import models
r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True
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