import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  const [jobs, setJobs] = useState([]);
  const [file, setFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadJobs = async () => {
    try {
      const res = await fetch(`${API}/jobs/`);

      if (!res.ok) {
        throw new Error("Failed to load jobs");
      }

      const data = await res.json();
      setJobs(data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Backend is not reachable.");
    }
  };

  // Create a job and immediately return to the dashboard.
  // This allows multiple jobs to be submitted one after another.
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

      await loadJobs();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Refresh jobs periodically so the dashboard shows
  // QUEUED -> PROCESSING -> COMPLETED automatically.
  useEffect(() => {
    loadJobs();

    const interval = setInterval(loadJobs, 1000);

    return () => clearInterval(interval);
  }, []);

  const queued = jobs.filter(
    (job) => job.status === "QUEUED"
  ).length;

  const processing = jobs.filter(
    (job) => job.status === "PROCESSING"
  ).length;

  const completed = jobs.filter(
    (job) => job.status === "COMPLETED"
  ).length;

  const failed = jobs.filter(
    (job) => job.status === "FAILED"
  ).length;

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">
        <div>
          <div className="brand">
            <span className="brand-icon">⚡</span>
            AsyncFlow
          </div>

          <p>
            Asynchronous background job processing system
          </p>
        </div>

        <div className="system-status">
          <span className="online-dot"></span>
          Worker System Online
        </div>
      </header>

      <main className="container">

        {/* ARCHITECTURE */}
        <section className="architecture">

          <div className="architecture-step">
            <div className="architecture-icon">📄</div>
            <div>
              <strong>Submit Job</strong>
              <span>FastAPI</span>
            </div>
          </div>

          <div className="arrow">→</div>

          <div className="architecture-step">
            <div className="architecture-icon">📦</div>
            <div>
              <strong>Queue</strong>
              <span>Redis</span>
            </div>
          </div>

          <div className="arrow">→</div>

          <div className="architecture-step">
            <div className="architecture-icon">⚙</div>
            <div>
              <strong>Worker</strong>
              <span>Background Process</span>
            </div>
          </div>

          <div className="arrow">→</div>

          <div className="architecture-step">
            <div className="architecture-icon">✓</div>
            <div>
              <strong>Result</strong>
              <span>Database</span>
            </div>
          </div>

        </section>

        {/* STATISTICS */}
        <section className="stats">

          <div className="stat-card">
            <span>Total Jobs</span>
            <strong>{jobs.length}</strong>
          </div>

          <div className="stat-card queue-card">
            <span>In Queue</span>
            <strong>{queued}</strong>
          </div>

          <div className="stat-card processing-card">
            <span>Processing</span>
            <strong>{processing}</strong>
          </div>

          <div className="stat-card completed-card">
            <span>Completed</span>
            <strong>{completed}</strong>
          </div>

          <div className="stat-card failed-card">
            <span>Failed</span>
            <strong>{failed}</strong>
          </div>

        </section>

        {/* CREATE JOB */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Submit Background Job</h2>
              <p>
                Jobs are added to the Redis queue and processed
                asynchronously by the worker.
              </p>
            </div>
          </div>

          <div className="upload-box">

            <div className="upload-icon">
              ↑
            </div>

            <div className="upload-content">
              <strong>
                {file
                  ? file.name
                  : "Choose a file to process"}
              </strong>

              <span>
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB`
                  : "Submit multiple jobs without waiting for completion"}
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
            {creating ? "Submitting..." : "Submit Job"}
          </button>

          <p className="hint">
            You can submit another job immediately after this one.
          </p>

        </section>

        {/* QUEUE VISUALIZATION */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Processing Pipeline</h2>
              <p>
                Live view of jobs moving through the system
              </p>
            </div>
          </div>

          <div className="pipeline">

            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="queue-dot"></span>
                QUEUED
                <b>{queued}</b>
              </div>

              <div className="pipeline-jobs">
                {jobs
                  .filter((job) => job.status === "QUEUED")
                  .map((job) => (
                    <div className="pipeline-job" key={job.id}>
                      <strong>#{job.id}</strong>
                      <span>{job.filename}</span>
                    </div>
                  ))}

                {queued === 0 && (
                  <div className="empty-small">
                    Queue empty
                  </div>
                )}
              </div>

            </div>

            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="processing-dot"></span>
                PROCESSING
                <b>{processing}</b>
              </div>

              <div className="pipeline-jobs">
                {jobs
                  .filter(
                    (job) => job.status === "PROCESSING"
                  )
                  .map((job) => (
                    <div
                      className="pipeline-job processing-job"
                      key={job.id}
                    >
                      <strong>#{job.id}</strong>
                      <span>{job.filename}</span>
                    </div>
                  ))}

                {processing === 0 && (
                  <div className="empty-small">
                    Worker available
                  </div>
                )}
              </div>

            </div>

            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="completed-dot"></span>
                COMPLETED
                <b>{completed}</b>
              </div>

              <div className="pipeline-jobs">
                {jobs
                  .filter(
                    (job) => job.status === "COMPLETED"
                  )
                  .slice(0, 5)
                  .map((job) => (
                    <div
                      className="pipeline-job completed-job"
                      key={job.id}
                    >
                      <strong>#{job.id}</strong>
                      <span>{job.filename}</span>
                    </div>
                  ))}

                {completed === 0 && (
                  <div className="empty-small">
                    No completed jobs
                  </div>
                )}
              </div>

            </div>

          </div>

        </section>

        {/* ALL JOBS */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Job History</h2>
              <p>
                All submitted jobs and their current state
              </p>
            </div>

            <button
              className="refresh-btn"
              onClick={loadJobs}
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
        AsyncFlow • FastAPI • Redis • SQLAlchemy • Background Worker
      </footer>

    </div>
  );
}

export default App;