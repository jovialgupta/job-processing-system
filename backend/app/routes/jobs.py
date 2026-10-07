import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal
from ..redis_client import r, QUEUE, PROCESSING
from ..schemas import JobResponse

UPLOAD_DIR = "uploads"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024

router = APIRouter(prefix="/jobs", tags=["Jobs"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=JobResponse)
def create_job(file: UploadFile = File(...), db: Session = Depends(get_db)):
    original_name = os.path.basename(file.filename or "upload.pdf")  # strips ../ tricks

    # 1) validate: must look like a PDF (extension + magic bytes)
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")

    header = file.file.read(5)
    if header != b"%PDF-":
        raise HTTPException(status_code=400, detail="File is not a valid PDF")
    file.file.seek(0)

    # 2) save under a unique name so two "resume.pdf" uploads never collide
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.pdf"
    path = os.path.join(UPLOAD_DIR, stored_name)

    size = 0
    try:
        with open(path, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
                    )
                out.write(chunk)
    except HTTPException:
        os.remove(path)
        raise

    # 3) create the DB record
    job = models.Job(filename=original_name, stored_filename=stored_name, status="QUEUED")
    db.add(job)
    db.commit()
    db.refresh(job)

    # 4) enqueue
    try:
        r.lpush(QUEUE, str(job.id))
    except Exception:
        job.status = "FAILED"
        job.error = "Could not add job to Redis queue"
        db.commit()
        raise HTTPException(status_code=503, detail="Could not add job to processing queue")

    return job


@router.get("/queue")
def get_queue():
    waiting = r.lrange(QUEUE, 0, -1)
    in_progress = r.lrange(PROCESSING, 0, -1)
    return {
        "queue_length": len(waiting),
        "jobs": waiting,
        "in_progress": len(in_progress),  # [NEW]
    }


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/", response_model=list[JobResponse])
def get_jobs(limit: int = 200, offset: int = 0, db: Session = Depends(get_db)):
    # [CHANGED] pagination + newest first (was: return every job)
    limit = max(1, min(limit, 1000))
    return (
        db.query(models.Job)
        .order_by(models.Job.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.delete("/{job_id}")  # [NEW] the README promised this
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "PROCESSING":
        raise HTTPException(status_code=409, detail="Cannot delete a job that is processing")

    r.lrem(QUEUE, 0, str(job_id))

    if job.stored_filename:
        path = os.path.join(UPLOAD_DIR, job.stored_filename)
        if os.path.exists(path):
            os.remove(path)

    db.delete(job)
    db.commit()
    return {"deleted": job_id}