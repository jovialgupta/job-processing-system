import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  const [jobs, setJobs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [file, setFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      const [jobsRes, queueRes] = await Promise.all([
        fetch(`${API}/jobs/`),
        fetch(`${API}/jobs/queue`),
      ]);

      if (!jobsRes.ok || !queueRes.ok) {
        throw new Error("Failed to load data");
      }

      const jobsData = await jobsRes.json();
      const queueData = await queueRes.json();

      setJobs(jobsData);
      setQueue(queueData.jobs || []);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Backend is not reachable.");
    }
  };

  const createJob = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API}/jobs/`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to create job");
      }

      setFile(null);
      document.getElementById("fileInput").value = "";

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 1000);

    return () => clearInterval(interval);
  }, []);

  const queued = jobs.filter(
    (job) => job.status === "QUEUED"
  );

  const processing = jobs.filter(
    (job) => job.status === "PROCESSING"
  );

  const completed = jobs.filter(
    (job) => job.status === "COMPLETED"
  );

  const failed = jobs.filter(
    (job) => job.status === "FAILED"
  );

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">
        <div>
          <div className="brand">⚡ File Processing Dashboard</div>
          <p>
            Submit files, monitor queued jobs, and track processing status.
          </p>
        </div>

        <div className="system-status">
          <span className="online-dot"></span>
          Worker Online
        </div>
      </header>

      <main className="container">

        {/* STATISTICS */}
        <section className="stats">

          <div className="stat-card">
            <span>Total Jobs</span>
            <strong>{jobs.length}</strong>
          </div>

          <div className="stat-card queue-card">
            <span>Queued</span>
            <strong>{queue.length}</strong>
          </div>

          <div className="stat-card processing-card">
            <span>Processing</span>
            <strong>{processing.length}</strong>
          </div>

          <div className="stat-card completed-card">
            <span>Completed</span>
            <strong>{completed.length}</strong>
          </div>

          <div className="stat-card failed-card">
            <span>Failed</span>
            <strong>{failed.length}</strong>
          </div>

        </section>

        {/* CREATE JOB */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Submit a New Job</h2>
              <p>
                Upload a file and add it to the processing queue.
              </p>
            </div>
          </div>

          <div className="upload-box">

            <div className="upload-icon">
              ↑
            </div>

            <div className="upload-content">
              <strong>
                {file ? file.name : "Choose a file to process"}
              </strong>

              <span>
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB`
                  : "You can submit multiple jobs"}
              </span>
            </div>

            <label className="browse-btn">
              Browse

              <input
                id="fileInput"
                type="file"
                onChange={(e) => {
                  setFile(e.target.files[0]);
                  setError("");
                }}
              />
            </label>

          </div>

          {error && (
            <div className="error">
              ⚠ {error}
            </div>
          )}

          <button
            className="create-btn"
            onClick={createJob}
            disabled={!file || creating}
          >
            {creating ? "Submitting..." : "Create Job"}
          </button>

        </section>

        {/* REDIS QUEUE */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Redis Queue</h2>
              <p>
                Jobs currently waiting for the background worker.
              </p>
            </div>

            <div className="queue-count">
              {queue.length} waiting
            </div>
          </div>

          {queue.length === 0 ? (

            <div className="queue-empty">
              <div className="queue-empty-icon">✓</div>
              <strong>Queue is empty</strong>
              <span>
                All submitted jobs have been picked up by the worker.
              </span>
            </div>

          ) : (

            <div className="redis-queue">

              {queue.map((jobId, index) => {

                const job = jobs.find(
                  (item) => item.id === Number(jobId)
                );

                return (
                  <div
                    className="queue-item"
                    key={jobId}
                  >
                    <div className="queue-position">
                      #{index + 1}
                    </div>

                    <div>
                      <strong>Job #{jobId}</strong>

                      <span>
                        {job?.filename || "Waiting for processing"}
                      </span>
                    </div>

                    <span className="status queued">
                      QUEUED
                    </span>
                  </div>
                );
              })}

            </div>
          )}

        </section>

        {/* PIPELINE */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Job Processing</h2>
              <p>
                Live job lifecycle from queue to completion.
              </p>
            </div>
          </div>

          <div className="pipeline">

            {/* QUEUED */}
            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="queue-dot"></span>
                QUEUED
                <b>{queued.length}</b>
              </div>

              <div className="pipeline-jobs">

                {queued.map((job) => (
                  <div
                    className="pipeline-job"
                    key={job.id}
                  >
                    <strong>#{job.id}</strong>
                    <span>{job.filename}</span>
                  </div>
                ))}

                {queued.length === 0 && (
                  <div className="empty-small">
                    No queued jobs
                  </div>
                )}

              </div>

            </div>

            {/* PROCESSING */}
            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="processing-dot"></span>
                PROCESSING
                <b>{processing.length}</b>
              </div>

              <div className="pipeline-jobs">

                {processing.map((job) => (
                  <div
                    className="pipeline-job processing-job"
                    key={job.id}
                  >
                    <strong>#{job.id}</strong>
                    <span>{job.filename}</span>
                  </div>
                ))}

                {processing.length === 0 && (
                  <div className="empty-small">
                    Worker available
                  </div>
                )}

              </div>

            </div>

            {/* COMPLETED */}
            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="completed-dot"></span>
                COMPLETED
                <b>{completed.length}</b>
              </div>

              <div className="pipeline-jobs">

                {completed.map((job) => (
                  <div
                    className="pipeline-job completed-job"
                    key={job.id}
                  >
                    <strong>#{job.id}</strong>
                    <span>{job.filename}</span>
                  </div>
                ))}

                {completed.length === 0 && (
                  <div className="empty-small">
                    No completed jobs
                  </div>
                )}

              </div>

            </div>

          </div>

        </section>

        {/* JOB HISTORY */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Job History</h2>
              <p>All submitted jobs.</p>
            </div>

            <button
              className="refresh-btn"
              onClick={loadData}
            >
              ↻ Refresh
            </button>
          </div>

          {jobs.length === 0 ? (

            <div className="empty">
              <div>📂</div>
              <p>No jobs submitted yet.</p>
            </div>

          ) : (

            <div className="table">

              <div className="table-header">
                <span>ID</span>
                <span>FILE</span>
                <span>STATUS</span>
                <span>RESULT</span>
                <span>CREATED</span>
              </div>

              {jobs
                .slice()
                .reverse()
                .map((job) => (

                  <div
                    className="table-row"
                    key={job.id}
                  >

                    <strong>
                      #{job.id}
                    </strong>

                    <span className="filename">
                      {job.filename}
                    </span>

                    <span>
                      <span
                        className={`status ${job.status.toLowerCase()}`}
                      >
                        {job.status}
                      </span>
                    </span>

                    <span className="result">
                      {job.result || "—"}
                    </span>

                    <span className="created">
                      {job.created_at
                        ? new Date(
                          job.created_at
                        ).toLocaleString()
                        : "—"}
                    </span>

                  </div>

                ))}

            </div>

          )}

        </section>

      </main>

      <footer>
        File Processing Dashboard
      </footer>

    </div>
  );
}

export default App;