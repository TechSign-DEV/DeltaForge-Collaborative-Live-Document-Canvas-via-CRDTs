
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  FileText,
  History,
  RotateCcw,
  Save,
} from "lucide-react";

import api from "../services/api";
import CollaborativeEditor from "../components/CollaborativeEditor";

function DocumentPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState(null);
  const [snapshots, setSnapshots] = useState([]);

  const [loading, setLoading] = useState(true);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);

  const [error, setError] = useState("");
  const [snapshotError, setSnapshotError] = useState("");
  const [versionLabel, setVersionLabel] = useState("");

  const [savingVersion, setSavingVersion] = useState(false);
  const [restoringSnapshot, setRestoringSnapshot] = useState(null);

  const [message, setMessage] = useState("");

  // Editor synchronization function
  const [flushEditorUpdates, setFlushEditorUpdates] = useState(null);

  const handleFlushReady = useCallback((flushFunction) => {
    setFlushEditorUpdates(() => flushFunction);
  }, []);

  // Fetch document details
  useEffect(() => {
    const controller = new AbortController();

    const fetchDocument = async () => {
      try {
        setLoading(true);
        setError("");
        setDocument(null);
        setFlushEditorUpdates(null);

        const response = await api.get(`/documents/${id}`, {
          signal: controller.signal,
        });

        setDocument(response.data.document);
      } catch (err) {
        if (err.code !== "ERR_CANCELED") {
          setError(
            err.response?.data?.message ||
              "Unable to load document."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchDocument();

    return () => {
      controller.abort();
    };
  }, [id]);

  // Fetch snapshot history
  const loadSnapshots = useCallback(async (signal) => {
    try {
      setSnapshotsLoading(true);
      setSnapshotError("");

      const response = await api.get(`/snapshots/${id}`, {
        signal,
      });

      setSnapshots(response.data.snapshots || []);
    } catch (err) {
      if (err.code !== "ERR_CANCELED") {
        setSnapshotError(
          err.response?.data?.message ||
            "Unable to load version history."
        );
      }
    } finally {
      if (!signal?.aborted) {
        setSnapshotsLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();

    setSnapshots([]);
    loadSnapshots(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadSnapshots]);

  // Create snapshot
  const handleCreateSnapshot = async () => {
    try {
      setSavingVersion(true);
      setMessage("");
      setSnapshotError("");

      if (!flushEditorUpdates) {
        throw new Error(
          "Editor synchronization is not ready. Please wait."
        );
      }

      // Persist pending local Yjs updates before requesting a snapshot.
      await flushEditorUpdates();

      await api.post(`/snapshots/${id}`, {
        label: versionLabel.trim() || "Saved version",
      });

      setVersionLabel("");
      setMessage("Version saved successfully.");

      await loadSnapshots();
    } catch (err) {
      setMessage(
        err.response?.data?.message ||
          err.message ||
          "Failed to save version."
      );
    } finally {
      setSavingVersion(false);
    }
  };

  // Restore snapshot as a separate document
  const handleRestoreSnapshot = async (snapshotId) => {
    const confirmed = window.confirm(
      "Restore this version as a new document? Your original document will not be changed."
    );

    if (!confirmed) return;

    try {
      setRestoringSnapshot(snapshotId);
      setMessage("");

      const response = await api.post(
        `/snapshots/${id}/restore/${snapshotId}`
      );

      const restoredDocument = response.data.document;

      if (!restoredDocument?._id) {
        throw new Error(
          "The server did not return the restored document."
        );
      }

      navigate(`/documents/${restoredDocument._id}`);
    } catch (err) {
      setMessage(
        err.response?.data?.message ||
          err.message ||
          "Failed to restore version."
      );
    } finally {
      setRestoringSnapshot(null);
    }
  };

  // Loading document
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-600">
        Loading document...
      </div>
    );
  }

  // Document loading error
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-6">
          <p className="text-red-600">{error}</p>

          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 text-blue-600 hover:underline"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!document) return null;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-6 py-4">

        <div className="flex items-center gap-3">

          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-lg p-2 hover:bg-gray-100"
            title="Back to Dashboard"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              {document.title}
            </h1>

            <p className="text-sm text-gray-500">
              DeltaForge Collaborative Document
            </p>
          </div>

        </div>

        <div className="flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />

          <span className="text-sm text-gray-600">
            Live document
          </span>
        </div>

      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">

        {/* Collaborative Editor */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">

       <CollaborativeEditor
  key={id}
  documentId={id}
  onFlushReady={handleFlushReady}
/>

        </section>

        {/* Version History */}
        <section className="rounded-xl border bg-white p-6 shadow-sm">

          <div className="mb-5 flex items-center gap-2">
            <History size={21} className="text-blue-600" />

            <h2 className="text-lg font-semibold text-gray-800">
              Version History
            </h2>
          </div>

          {/* Create Snapshot */}
          <div className="mb-6 flex flex-wrap gap-3">

            <input
              type="text"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              maxLength={100}
              placeholder="Enter version name (optional)"
              className="min-w-0 flex-1 rounded-lg border px-4 py-2 outline-none focus:border-blue-500"
            />

            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={savingVersion || !flushEditorUpdates}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={17} />

              {savingVersion
                ? "Saving..."
                : "Save Version"}
            </button>

          </div>

          {/* Feedback */}
          {message && (
            <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              {message}
            </p>
          )}

          {snapshotError && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {snapshotError}
            </p>
          )}

          {/* Snapshot List */}
          {snapshotsLoading ? (
            <p className="rounded-lg bg-gray-50 p-5 text-center text-gray-500">
              Loading version history...
            </p>
          ) : snapshots.length === 0 ? (

            <p className="rounded-lg bg-gray-50 p-5 text-center text-gray-500">
              No saved versions yet. Save a version to create your first snapshot.
            </p>

          ) : (

            <div className="space-y-3">

              {snapshots.map((snapshot) => (

                <div
                  key={snapshot._id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                >

                  <div>
                    <h3 className="font-medium text-gray-800">
                      {snapshot.label || "Saved version"}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Created by{" "}
                      {snapshot.createdBy?.name || "Unknown user"}
                    </p>

                    <p className="text-xs text-gray-400">
                      {snapshot.createdAt
                        ? new Date(snapshot.createdAt).toLocaleString()
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleRestoreSnapshot(snapshot._id)
                    }
                    disabled={
                      restoringSnapshot !== null ||
                      savingVersion
                    }
                    className="flex items-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw size={16} />

                    {restoringSnapshot === snapshot._id
                      ? "Restoring..."
                      : "Restore"}
                  </button>

                </div>

              ))}

            </div>
          )}

        </section>

      </main>
    </div>
  );
}

export default DocumentPage;
