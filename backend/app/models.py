from sqlalchemy import Column, Integer, String, DateTime
from .database import Base
from datetime import datetime


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    status = Column(String, default="QUEUED", nullable=False)
    created_at = Column(DateTime,default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    result = Column(String, nullable=True)