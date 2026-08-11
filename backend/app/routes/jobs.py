from fastapi import UploadFile, File
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal
from ..schemas import JobResponse
from ..worker import r


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=JobResponse)
def create_job(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    job = models.Job(
        filename=file.filename,
        status="QUEUED"
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        r.lpush("job_queue", str(job.id))

    except Exception:
        job.status = "FAILED"
        db.commit()

        raise HTTPException(
            status_code=503,
            detail="Could not add job to processing queue"
        )

    return job


@router.get("/queue")
def get_queue():
    job_ids = r.lrange("job_queue", 0, -1)

    return {
        "queue_length": len(job_ids),
        "jobs": job_ids
    }


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db)
):
    job = db.query(models.Job).filter(
        models.Job.id == job_id
    ).first()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )

    return job


@router.get("/", response_model=list[JobResponse])
def get_jobs(db: Session = Depends(get_db)):
    return db.query(models.Job).all()