import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  const [jobs, setJobs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [file, setFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 1000);

    return () => clearInterval(interval);
  }, []);

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

      const input = document.getElementById("fileInput");
      if (input) {
        input.value = "";
      }

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const submitJobs = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select at least one PDF.");
      return;
    }

    if (selectedFiles.length > 10) {
      alert("You can upload a maximum of 10 PDFs at once.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      for (const selectedFile of selectedFiles) {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const res = await fetch(`${API}/jobs/`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Failed to submit ${selectedFile.name}`);
        }
      }

      setSelectedFiles([]);

      const input = document.getElementById("multiFileInput");
      if (input) {
        input.value = "";
      }

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sortedJobs = [...jobs].sort((a, b) => b.id - a.id);

  const queued = sortedJobs.filter(
    (job) => job.status === "QUEUED"
  );

  const processing = sortedJobs.filter(
    (job) => job.status === "PROCESSING"
  );

  const completed = sortedJobs.filter(
    (job) => job.status === "COMPLETED"
  );

  const failed = sortedJobs.filter(
    (job) => job.status === "FAILED"
  );

  const formatResult = (result) => {
    if (!result) {
      return "—";
    }

    return result
      .replace("Processing failed:", "Processing failed:\n")
      .replace(". Pages:", "\nPages:")
      .replace(". Characters extracted:", "\nCharacters extracted:");
  };

  return (
    <div className="app">

      <header className="header">
        <div className="brand">
          Job Processing Dashboard
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

        {/* ERROR */}
        {
          error && (
            <div className="error-box">
              {error}
            </div>
          )
        }

        {/* CREATE JOB */}
        {/* SUBMIT JOBS */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Submit Jobs</h2>
              <p>
                Select one or more PDF files and add them to the processing queue.
              </p>
            </div>
          </div>

          <div className="upload-box">

            <div className="upload-icon">
              ↑
            </div>

            <div className="upload-content">

              <strong>
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""} selected`
                  : "Choose files to process"}
              </strong>

              <span>
                Select up to 10 PDF files
              </span>

              <input
                id="multiFileInput"
                className="hidden-file-input"
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);

                  if (files.length > 10) {
                    alert("You can upload a maximum of 10 PDFs at once.");
                    e.target.value = "";
                    setSelectedFiles([]);
                    return;
                  }

                  setSelectedFiles(files);
                }}
              />

            </div>
            <label
              htmlFor="multiFileInput"
              className="file-btn"
            >
              Choose Files
            </label>

            <button
              className="primary-btn"
              onClick={submitJobs}
              disabled={
                submitting ||
                selectedFiles.length === 0
              }
            >
              {submitting ? "Submitting..." : "Submit Jobs"}
            </button>

          </div>

          {selectedFiles.length > 0 && (
            <div className="selected-files">

              <strong>
                Selected files:
              </strong>

              {selectedFiles.map((selectedFile, index) => (
                <div
                  className="selected-file"
                  key={`${selectedFile.name}-${index}`}
                >
                  {selectedFile.name}
                </div>
              ))}

            </div>
          )}

        </section>

        {/* QUEUE PIPELINE */}
        <section className="panel">

          <div className="panel-heading">
            <div>
              <h2>Redis Queue & Processing</h2>
              <p>
                Live view of jobs moving through the processing pipeline.
              </p>
            </div>
          </div>

          <div className="pipeline">

            {/* QUEUED */}
            <div className="pipeline-column">

              <div className="pipeline-title">
                <span className="queued-dot"></span>
                QUEUED
                <b>{queued.length}</b>
              </div>

              <div className="pipeline-jobs">

                {queued.map((job) => (
                  <div
                    className="pipeline-job queued-job"
                    key={job.id}
                  >
                    <strong>{job.id}</strong>
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
                    <strong>{job.id}</strong>
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
                    <strong>{job.id}</strong>
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

              {sortedJobs.map((job) => (

                <div
                  className="table-row"
                  key={job.id}
                >

                  <strong className="job-id">
                    {job.id}
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
                    {formatResult(job.result)}
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

      </main >

      <footer>
        Async File Processing Dashboard
      </footer>

    </div >
  );
}

export default App;