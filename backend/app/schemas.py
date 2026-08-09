from pydantic import BaseModel
from datetime import datetime


class JobResponse(BaseModel):
    id: int
    filename: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    result: str | None = None

class JobCreate(BaseModel):
    filename: str

class Config:
        from_attributes = True