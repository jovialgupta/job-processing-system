from datetime import datetime

from pydantic import BaseModel, ConfigDict


class JobResponse(BaseModel):
    # FIX: this used to sit outside the class, so it did nothing
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    status: str
    retry_count: int = 0
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result: str | None = None
    error: str | None = None
