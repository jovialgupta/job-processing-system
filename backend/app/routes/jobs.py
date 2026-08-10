from fastapi import APIRouter
from sqlalchemy.orm import Session
from .. import models
from ..database import SessionLocal
from ..schemas import JobResponse
from fastapi import APIRouter, Depends, HTTPException
from ..worker import r

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)
@router.post("/")
def create_job():
    return {"message": "Job created"}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=JobResponse)
def create_job(db: Session = Depends(get_db)):
    job = models.Job(
        filename="test.pdf",
        status="pending"
    )

    db.add(job)
    db.commit()
    db.refresh(job)
    r.lpush("job_queue", str(job.id))
    return job

@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )
    return job
@router.get("/",response_model=list[JobResponse])
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).all()
    return jobs


//API creates → PostgreSQL stores → Redis queues.