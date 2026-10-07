# Job Processing System

An asynchronous, fault-tolerant PDF-processing backend built with **FastAPI, Redis, PostgreSQL and SQLAlchemy**.

The API accepts a PDF upload, stores a job record, and returns a job ID immediately. A pool of worker processes picks jobs up from a Redis queue, extracts the text with PyMuPDF, and records the outcome in PostgreSQL. Submission is decoupled from execution, so the API stays fast regardless of how long processing takes.

## Highlights

- **Non-blocking API:** job submission returns in **24 ms avg (60 ms p95)** while processing happens in the background.
- **Horizontal worker scaling:** going from 1 to 3 worker processes raised throughput from **3.13 to 6.58 jobs/sec (2.1x)** on a 30-job batch of 148-page PDFs.
- **Crash-safe queue:** jobs move atomically from the queue to an in-flight list (`BLMOVE`). Interrupted jobs are re-queued on startup.
- **Bounded retries:** transient failures are retried up to 3 times. Permanent failures (corrupt PDF, no extractable text) fail immediately.
- **Persistent job lifecycle:** `QUEUED -> PROCESSING -> COMPLETED / FAILED`, with `created_at`, `started_at`, `completed_at`, `retry_count`, `result` and `error` stored in PostgreSQL.
- **Hardened uploads:** extension and `%PDF-` magic-byte validation, size limit, UUID file storage (no filename collisions or path tricks).
- **Containerized:** one command starts PostgreSQL, Redis, the API and the workers.

## Architecture

```
                 POST /jobs/ (PDF)
   Client  ------------------------>  FastAPI API
                                         |  1. validate + save file (uuid name)
                                         |  2. INSERT job (QUEUED) -> PostgreSQL
                                         |  3. LPUSH job_id        -> Redis "job_queue"
   Client  <---- job ID (instant) -------+

                       Redis "job_queue"
                              |
                              |  BLMOVE (atomic: queue -> in-flight)
                              v
                 +--------------------------+
                 |  Worker 1 / 2 / 3        |   (separate OS processes)
                 |  - mark PROCESSING       |
                 |  - extract text (PyMuPDF)|
                 |  - mark COMPLETED/FAILED |
                 |  - remove from in-flight |
                 +--------------------------+
                              |
                              v
                        PostgreSQL (jobs table)
```

### Job lifecycle

```
QUEUED --> PROCESSING --> COMPLETED
   ^            |
   |            +--(transient error, retry_count < 3)--> QUEUED
   |            |
   |            +--(permanent error or retries exhausted)--> FAILED
   |
   +-- worker crash: job is still in the Redis in-flight list,
       re-queued by startup recovery
```

## Tech stack

| Layer | Technology |
|---|---|
| API | FastAPI, Uvicorn |
| Queue | Redis (lists, `BLMOVE`) |
| Database | PostgreSQL, SQLAlchemy |
| Workers | Python `multiprocessing`, PyMuPDF |
| Packaging | Docker, Docker Compose |

## Quick start (Docker)

```bash
docker compose up --build
```

- Interactive API docs (Swagger UI): http://localhost:8000/docs
- Health check: http://localhost:8000/health

Change the number of workers:

```bash
NUM_WORKERS=1 docker compose up --build
```

Try it:

```bash
# submit a PDF
curl -F "file=@sample.pdf" http://localhost:8000/jobs/

# check a job
curl http://localhost:8000/jobs/1

# list recent jobs
curl "http://localhost:8000/jobs/?limit=20"

# queue status
curl http://localhost:8000/jobs/queue
```

## Running locally (without Docker)

Requirements: Python 3.12+, a running PostgreSQL and Redis.

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # then edit DATABASE_URL etc.

# terminal 1: API
uvicorn app.main:app --reload

# terminal 2: workers
python -m app.start_workers
```

If you are upgrading an existing database, run `backend/migration.sql` once (or drop the `jobs` table and let the API recreate it).

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/jobs/` | Upload a PDF. Returns the job record immediately (status `QUEUED`). |
| `GET` | `/jobs/{id}` | Get one job: status, timestamps, retry count, result, error. |
| `GET` | `/jobs/?limit=&offset=` | List jobs, newest first (default limit 200, max 1000). |
| `GET` | `/jobs/queue` | Number of waiting jobs, their IDs, and the in-flight count. |
| `DELETE` | `/jobs/{id}` | Delete a job and its file. Returns 409 if the job is currently processing. |
| `GET` | `/health` | Checks API, PostgreSQL and Redis. Returns 503 if a dependency is down. |

Upload validation errors: `400` (not a PDF), `413` (file too large), `503` (queue unavailable).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis connection |
| `NUM_WORKERS` | `3` | Number of worker processes |
| `MAX_RETRIES` | `3` | Retries for transient failures |
| `MAX_UPLOAD_MB` | `10` | Maximum upload size |
| `ARTIFICIAL_DELAY_SECONDS` | `0` | Optional per-job delay to simulate heavier work. Leave at 0 for real measurements. |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed origins (comma-separated) |

## Fault tolerance

- **Reliable queue:** a worker takes a job with `BLMOVE`, which atomically moves the ID from `job_queue` to `job_processing`. The ID is only removed from `job_processing` once the job finishes (success or final failure).
- **Startup recovery:** `recover_stuck_jobs()` runs before workers start and moves anything left in `job_processing` back to `job_queue`, resetting its status to `QUEUED`. I tested this by killing a worker container mid-job and restarting it; the interrupted job was picked up and completed.
- **Retries:** transient errors increment `retry_count` and re-queue the job, up to `MAX_RETRIES`. After that the job is marked `FAILED` with the reason stored in `error`.

## Benchmark

Measured with `backend/benchmark.py`: 30 submissions of the same 148-page PDF (~800 KB), run locally with Docker Compose. Each configuration was run multiple times; the table reports the **median**.

| Workers | Throughput | Speedup |
|---|---|---|
| 1 | 3.13 jobs/sec | 1.0x |
| 3 | 6.58 jobs/sec | 2.1x |

- **Submit latency (API response time):** 24 ms average, 60 ms p95.
- **Estimated inline latency:** ~430 ms. This is calculated as submit time + average processing time, i.e. roughly what a client would wait if the request processed the PDF itself. It is an estimate, not a measurement of a separate synchronous implementation.
- Scaling is sub-linear (2.1x on 3 workers) because workers share PostgreSQL and Redis and are limited by available CPU cores.
- Test machine: *[add CPU model / core count / RAM here]*

To reproduce:

```bash
pip install requests
NUM_WORKERS=1 docker compose up --build -d
python backend/benchmark.py --pdf sample.pdf --jobs 30
docker compose down
NUM_WORKERS=3 docker compose up --build -d
python backend/benchmark.py --pdf sample.pdf --jobs 30
```

## Project structure

```
job-processing-system/
├── docker-compose.yml
├── README.md
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── .env.example
    ├── migration.sql
    ├── benchmark.py
    └── app/
        ├── main.py            # FastAPI app, /health
        ├── database.py        # SQLAlchemy engine/session
        ├── models.py          # Job model
        ├── schemas.py         # Pydantic response models
        ├── redis_client.py    # shared Redis client + queue names
        ├── worker.py          # worker loop, retries, crash recovery
        ├── start_workers.py   # spawns N worker processes
        └── routes/
            └── jobs.py        # job endpoints
```

## Known limitations

- **Submit gap:** if the API crashes after saving the job to PostgreSQL but before pushing to Redis, the job stays `QUEUED` and is never picked up. A periodic sweeper for stale `QUEUED` jobs would close this.
- **Recovery assumes a full restart:** `recover_stuck_jobs()` runs at startup and assumes no other workers are mid-job. Running workers on several machines would need per-job leases/heartbeats instead.
- **Redis durability:** the queue lives in Redis. A Redis data loss loses queued job IDs (the job rows in PostgreSQL remain).
- No authentication or rate limiting, and no automated test suite yet.
- Only PDF text extraction is implemented as the job type.

## Possible next steps

- Sweeper for stale `QUEUED`/`PROCESSING` jobs, with lease timeouts
- Exponential backoff between retries
- Automated tests (pytest) for the retry and recovery paths
- Prometheus metrics for queue depth, processing time and failure rate
- API-key authentication
