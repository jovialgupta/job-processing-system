from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)          # original name (shown in UI)
    stored_filename = Column(String, nullable=True)    # uuid name on disk   [NEW]
    status = Column(String, default="QUEUED", nullable=False, index=True)
    retry_count = Column(Integer, default=0, nullable=False)  # [NEW]
    created_at = Column(DateTime, default=utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)       # [NEW] for processing time
    completed_at = Column(DateTime, nullable=True)
    result = Column(String, nullable=True)
    error = Column(String, nullable=True)              # [NEW] last failure reason