from fastapi import APIRouter

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)
@router.post("/")
def create_job():
    return {"message": "Job created"}