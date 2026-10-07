import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .database import engine, Base
from . import models
from .redis_client import r
from .routes import jobs

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Processing System")

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Job processing API is running"}


@app.get("/health")  # [NEW]
def health():
    status = {"api": "ok", "database": "ok", "redis": "ok"}

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        status["database"] = "down"

    try:
        r.ping()
    except Exception:
        status["redis"] = "down"

    healthy = all(v == "ok" for v in status.values())
    return JSONResponse(status, status_code=200 if healthy else 503)


app.include_router(jobs.router)
