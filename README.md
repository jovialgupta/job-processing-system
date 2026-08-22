# Job Processing System

An asynchronous file-processing platform that allows users to submit
processing jobs, track execution, retrieve results, and monitor failures
through a React dashboard.

The system separates job submission from job execution using FastAPI
for the API layer, Redis as the job queue, PostgreSQL as the
persistent source of truth, and a pool of three background workers
for concurrent processing.

## Repository

The complete source code is available on GitHub:

GitHub: https://github.com/jovialgupta/job-processing-system

The project is currently intended to be run locally.

## Why This Project?

Traditional file-processing APIs often perform the entire processing
operation during the original HTTP request.

```
Client
   |
   v
API
   |
   v
Process File
   |
   v
Response
```

This becomes problematic when processing takes significant time. The
client has to keep the request open, the API process remains occupied,
and multiple simultaneous jobs can put unnecessary load on the backend.

The Job Processing System separates job submission from job
execution.

Instead of processing the file immediately, the backend:

1. Creates a persistent job record in PostgreSQL.
2. Places the job ID into a Redis queue.
3. Returns the job information to the client.
4. Allows a background worker to process the job independently.
5. Updates PostgreSQL with the final result or failure information.

```
Client
   |
   v
FastAPI
   |
   +----> PostgreSQL
   |
   +----> Redis
            |
            v
        Workers
```

This keeps the API responsive while long-running processing happens
asynchronously.

## Architecture

```
                         ┌─────────────────┐
                         │      User       │
                         │   File Upload   │
                         └────────┬────────┘
                                  |
                                  v
                         ┌─────────────────┐
                         │     React       │
                         │    Frontend     │
                         └────────┬────────┘
                                  |
                              REST API
                                  |
                                  v
                         ┌─────────────────┐
                         │     FastAPI     │
                         │     Backend     │
                         └────────┬────────┘
                                  |
                    ┌─────────────┴─────────────┐
                    |                           |
                    v                           v
           ┌─────────────────┐        ┌─────────────────┐
           │   PostgreSQL    │        │      Redis      │
           │                 │        │     Queue       │
           │ Persistent      │        └────────┬────────┘
           │ Job State       │                 |
           │ Results         │       ┌─────────┼─────────┐
           │ Errors          │       |         |         |
           │ Timestamps      │       v         v         v
           └─────────────────┘   Worker 1  Worker 2  Worker 3
                                      |         |         |
                                      └─────────┼─────────┘
                                                |
                                                v
                                         File Processing
                                                |
                                                v
                                           Job Result
                                                |
                                                v
                                           PostgreSQL
```

The key design principle is:

FastAPI accepts the job, Redis distributes the job, workers process
the job, and PostgreSQL persists the job state and result.

## Features

### Asynchronous Job Processing

Users can submit a processing job without waiting for the entire
processing operation to finish.

The API creates the job, queues it, and returns the job information
while a background worker performs the actual processing.

### Redis-Based Job Queue

Redis acts as the asynchronous queue between FastAPI and the workers.

```
FastAPI
   |
   v
Redis Queue
   |
   v
Available Worker
```

Workers independently consume jobs from the queue.

### Three Background Workers

The system uses a 3-worker pool to process jobs concurrently.

```
                  Redis Queue
                      |
         ┌────────────┼────────────┐
         |            |            |
         v            v            v
     Worker 1     Worker 2     Worker 3
         |            |            |
         v            v            v
       Job A        Job B        Job C
```

This allows multiple jobs to be processed at the same time while keeping
concurrency bounded.

### Persistent Job Lifecycle

Each job follows a defined lifecycle:

```
QUEUED
   |
   v
PROCESSING
   |
   +---------> COMPLETED
   |
   +---------> FAILED
```

The current state is persisted in PostgreSQL rather than being kept only
in worker memory.

### Job Status Tracking

Supported job states include:

- QUEUED
- PROCESSING
- COMPLETED
- FAILED

The dashboard displays the current state of each job.

### Result Storage

When a worker successfully completes a job, the processing result is
persisted and can later be retrieved through the API.

This keeps the result available after the worker has finished
processing.

### Failure Tracking

If processing fails, the worker records the failure in PostgreSQL.

```
PROCESSING
      |
      v
   FAILED
```

Failure information is stored with the job so that it can be displayed
through the dashboard.

### Bounded Retry Support

Failed jobs can be retried within the configured retry limit.

```
FAILED
   |
   v
RETRY
   |
   v
QUEUED
   |
   v
PROCESSING
```

This allows recoverable processing failures to be attempted again
without creating a completely new job.

### Job History

Created jobs are persisted in PostgreSQL.

Users can inspect information such as:

- Job status
- Processing result
- Creation time
- Processing timestamps
- Failure information
- Retry state

### React Monitoring Dashboard

The React dashboard provides a visual interface for:

- File uploads
- Job creation
- Job status monitoring
- Job history
- Queue monitoring
- Result viewing
- Failure information
- Retry operations

## How the System Works

### 1. Upload a File

The user selects a file from the React dashboard.

The frontend sends the file to the FastAPI backend.

```
React
  |
  | File Upload
  v
FastAPI
```

### 2. Create a Job

FastAPI creates a persistent job record in PostgreSQL.

The initial state is:

```
QUEUED
```

A unique job ID is returned to the client.

### 3. Add the Job to Redis

The backend pushes the job ID into the Redis queue.

```
FastAPI
   |
   v
Redis Queue
```

The API does not wait for the worker to finish.

### 4. Worker Picks Up the Job

One of the three workers retrieves the job ID from Redis.

The worker retrieves the corresponding job information and changes the
job state:

```
QUEUED
   |
   v
PROCESSING
```

### 5. Process the File

The worker performs the file-processing operation independently of the
API request.

Because processing happens in the worker, the FastAPI request remains
lightweight.

### 6. Store the Result

If processing succeeds:

```
PROCESSING
   |
   v
COMPLETED
```

The result is persisted in PostgreSQL.

If processing fails:

```
PROCESSING
   |
   v
FAILED
```

The error information is persisted in PostgreSQL.

### 7. Monitor the Job

The frontend queries the backend for the latest job state.

The user can see:

- Current status
- Result
- Timestamps
- Failure information
- Retry status

## Job Processing Workflow

```
                         File Upload
                              |
                              v
                       React Frontend
                              |
                              v
                         FastAPI API
                              |
                    ┌─────────┴─────────┐
                    |                   |
                    v                   v
              PostgreSQL             Redis
              Job Record             Queue
                                        |
                                        v
                               Available Worker
                                        |
                                        v
                                  PROCESSING
                                        |
                              ┌─────────┴─────────┐
                              |                   |
                           Success              Error
                              |                   |
                              v                   v
                         COMPLETED             FAILED
                              |                   |
                              └─────────┬─────────┘
                                        |
                                        v
                                  PostgreSQL
                                        |
                                        v
                                  React Dashboard
```

## Redis vs PostgreSQL

Redis and PostgreSQL have deliberately different responsibilities.

### Redis

Redis is responsible for:

- Queueing jobs
- Temporarily holding jobs waiting for processing
- Distributing jobs to available workers

```
Redis
  |
  └── Queue / Job Distribution
```

### PostgreSQL

PostgreSQL is responsible for:

- Persistent job state
- Job history
- File metadata
- Results
- Timestamps
- Error information
- Retry information

```
PostgreSQL
  |
  └── Persistent State / Results
```

This prevents Redis from becoming the only source of truth for the
application.

## Worker Failure Handling

A worker can potentially crash while processing a job.

```
Job
 |
 v
Worker
 |
 v
PROCESSING
 |
 X
Worker crashes
```

The system does not rely only on worker memory for job information.

Job state is persisted in PostgreSQL, allowing the application to retain
information about the job independently of a particular worker process.

Failed jobs can then be identified and retried within the configured
retry limit.

## API

The backend exposes REST endpoints for job management.

The API is responsible for:

- Creating jobs
- Retrieving jobs
- Checking job status
- Retrieving results
- Deleting jobs
- Monitoring backend health

The API does not perform the long-running processing itself.

Instead:

```
POST /jobs/
      |
      v
Create Database Record
      |
      v
Push Job ID to Redis
      |
      v
Return Job ID
```

The worker handles the actual processing asynchronously.

## API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /jobs/           | Create a new processing job |
| GET    | /jobs/           | Retrieve job history |
| GET    | /jobs/{job_id}   | Retrieve job status and details |
| GET    | /jobs/queue      | Retrieve queued jobs |
| DELETE | /jobs/{job_id}   | Delete a job |
| GET    | /health          | Check backend health |

### Create Job

`POST /jobs/`

Creates a new processing job and adds its ID to the Redis queue.

Example response:

```json
{
  "job_id": "123",
  "status": "QUEUED"
}
```

### Get Job Status

`GET /jobs/{job_id}`

Returns the current state and information for a specific job.

Example:

```json
{
  "job_id": "123",
  "status": "PROCESSING"
}
```

### Get Job History

`GET /jobs/`

Returns previously created jobs and their current states.

### Get Queue

`GET /jobs/queue`

Returns information about jobs currently waiting in the processing
queue.

### Delete Job

`DELETE /jobs/{job_id}`

Deletes the specified job.

### Health Check

`GET /health`

Checks whether the backend service is running correctly.

## Technologies Used

| Component | Technology |
|-----------|------------|
| Frontend  | React, JavaScript |
| Backend   | Python, FastAPI |
| Queue     | Redis |
| Database  | PostgreSQL |
| ORM       | SQLAlchemy |
| API       | REST |
| Workers   | Python Background Workers |

## Project Structure

```
job-processing-system/
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── redis_client.py
│   │   ├── worker.py
│   │   └── routers/
│   │
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── uploads/
│
├── .gitignore
│
└── README.md
```

### Backend

The backend contains:

- FastAPI application
- Database configuration
- SQLAlchemy models
- Request/response schemas
- Redis configuration
- Worker implementation
- API routes

### Frontend

The frontend contains the React dashboard used to upload files and
monitor processing jobs.

### Uploads

The `uploads/` directory is used for uploaded files during local
development.

## Local Development

### Prerequisites

Install:

- Python 3.10+
- Node.js
- PostgreSQL
- Redis
- Git

### Clone the Repository

```
git clone https://github.com/jovialgupta/job-processing-system.git
cd job-processing-system
```

### Backend Setup

Move into the backend directory:

```
cd backend
```

Create a virtual environment:

```
python -m venv venv
```

Windows:

```
venv\Scripts\activate
```

macOS/Linux:

```
source venv/bin/activate
```

Install dependencies:

```
pip install -r requirements.txt
```

### Environment Variables

Create a `.env` file for local development.

Example:

```
DATABASE_URL=postgresql://username:password@localhost:5432/job_processing
REDIS_URL=redis://localhost:6379
```

Do not commit the actual `.env` file to GitHub.

Use `.env.example` to document required environment variables.

### Start PostgreSQL

Make sure PostgreSQL is running.

Create the application database:

```
CREATE DATABASE job_processing;
```

Update `DATABASE_URL` according to your local PostgreSQL credentials.

### Start Redis

Make sure Redis is running locally.

The default Redis address is:

```
redis://localhost:6379
```

### Start the Backend

From the backend directory:

```
uvicorn app.main:app --reload
```

The backend will run on:

```
http://127.0.0.1:8000
```

FastAPI's interactive documentation is available at:

```
http://127.0.0.1:8000/docs
```

### Start the Workers

The workers run separately from the FastAPI application.

Start the worker processes according to the worker entry point
configured in the project.

The system uses three workers:

- Worker 1
- Worker 2
- Worker 3

All workers connect to the same Redis queue and PostgreSQL database.

```
                  Redis Queue
                      |
         ┌────────────┼────────────┐
         |            |            |
         v            v            v
     Worker 1     Worker 2     Worker 3
```

### Start the Frontend

Move into the frontend directory:

```
cd frontend
```

Install dependencies:

```
npm install
```

Start the development server:

```
npm run dev
```

The React dashboard will then be available through the Vite development
server.

## Complete Local Flow

Once PostgreSQL, Redis, the backend, workers, and frontend are running:

```
                   React Frontend
                          |
                          v
                       FastAPI
                          |
             ┌────────────┴────────────┐
             |                         |
             v                         v
        PostgreSQL                   Redis
             |                       Queue
             |                         |
             |              ┌──────────┼──────────┐
             |              |          |          |
             |              v          v          v
             |           Worker 1   Worker 2   Worker 3
             |              |          |          |
             |              └──────────┼──────────┘
             |                         |
             |                         v
             |                  File Processing
             |                         |
             └─────────────────────────┘
```

## Engineering Challenges

### Separating Job Submission from Processing

The main architectural challenge was preventing long-running
file-processing tasks from blocking API requests.

The solution was to separate the responsibilities:

```
API
→ Accept Job

Redis
→ Queue Job

Worker
→ Process Job
```

This allows the API to remain responsive while processing is performed
asynchronously.

### Maintaining Persistent Job State

Workers can stop or crash while jobs are being processed.

Therefore, job state is persisted in PostgreSQL rather than relying only
on worker memory.

This allows the application to retain job information independently of a
particular worker process.

### Handling Concurrent Jobs

A single worker would process jobs sequentially.

The 3-worker pool allows multiple jobs to be processed concurrently
while keeping concurrency bounded.

```
Redis Queue
    |
    ├── Worker 1
    ├── Worker 2
    └── Worker 3
```

### Separating Queue and Database Responsibilities

Redis is used for queueing and job distribution, while PostgreSQL
maintains the durable application state.

```
Redis
→ Queue / Distribution

PostgreSQL
→ Persistent State / Results
```

### Handling Failed Jobs

Processing failures are persisted rather than being lost with the worker
process.

```
PROCESSING
    |
    v
  FAILED
```

The failure information can then be displayed to the user and the job
can be retried within the configured limit.

### Bounded Retries

Retries are bounded to prevent continuously failing jobs from being
processed indefinitely.

## Project Status

### Completed

The current implementation includes:

- Asynchronous job submission
- Redis-based job queue
- 3 background workers
- PostgreSQL-backed job lifecycle
- Persistent job states
- Job creation
- Job history
- Job status retrieval
- Result retrieval
- Failure tracking
- Bounded retry support
- Worker recovery
- REST API
- React dashboard
- File upload
- Queue monitoring
- Health monitoring

The project is currently available as a GitHub repository and is
intended to be run locally.

## Repository

GitHub: https://github.com/jovialgupta/job-processing-system

## Key Takeaway

The project demonstrates a queue-based asynchronous processing
architecture where each component has a clearly defined responsibility:

```
                         React Frontend
                               |
                               v
                            FastAPI
                               |
                    ┌──────────┴──────────┐
                    |                     |
                    v                     v
               PostgreSQL              Redis
                    |                     |
                    |              ┌──────┼──────┐
                    |              v      v      v
                    |           Worker Worker Worker
                    |              1      2      3
                    |              |      |      |
                    |              └──────┼──────┘
                    |                     |
                    |                     v
                    |              File Processing
                    |                     |
                    └─────────────────────┘
```

FastAPI accepts jobs, Redis queues and distributes them, three workers
process them concurrently, and PostgreSQL maintains the persistent
source of truth for job state, results, timestamps, and failures.
