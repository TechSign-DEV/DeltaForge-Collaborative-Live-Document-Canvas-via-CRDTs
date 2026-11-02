
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Plus,
  FileText,
  Trash2,
  Pencil,
  LogOut,
  RefreshCw,
  Share2,
  X,
  Users,
  Mail,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Sharing modal state
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("editor");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");

  const currentUserId = String(user?.id || user?._id || "");

  const getId = (value) => {
    return String(value?._id || value || "");
  };

  const isOwner = (doc) => {
    return getId(doc.owner) === currentUserId;
  };

  const canEdit = (doc) => {
    if (isOwner(doc)) return true;

    return (doc.collaborators || []).some((collaborator) => {
      return (
        getId(collaborator.user) === currentUserId &&
        collaborator.role === "editor"
      );
    });
  };

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/documents");
      setDocuments(response.data.documents || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to fetch documents"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError("");

      const response = await api.post("/documents", {
        title: "Untitled Document",
      });

      const newDocument = response.data.document;

      setDocuments((prev) => [newDocument, ...prev]);
      navigate(`/documents/${newDocument._id}`);
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to create document"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id, oldTitle) => {
    const title = window.prompt("Enter new document name:", oldTitle);

    if (!title || !title.trim()) return;

    try {
      setActionLoading(`rename-${id}`);
      setError("");

      const response = await api.put(`/documents/${id}/rename`, {
        title: title.trim(),
      });

      setDocuments((prev) =>
        prev.map((doc) =>
          doc._id === id
            ? {
                ...doc,
                title: response.data.document.title,
                updatedAt: response.data.document.updatedAt,
              }
            : doc
        )
      );
    } catch (err) {
      setError(err.response?.data?.message || "Rename failed");
    } finally {
      setActionLoading("");
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this document? This action cannot be undone."
    );

    if (!confirmDelete) return;

    try {
      setActionLoading(`delete-${id}`);
      setError("");

      await api.delete(`/documents/${id}`);

      setDocuments((prev) => prev.filter((doc) => doc._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Delete failed");
    } finally {
      setActionLoading("");
    }
  };

  // Open sharing modal
  const openShareModal = (doc) => {
    setSelectedDocument(doc);
    setShareEmail("");
    setShareRole("editor");
    setShareError("");
    setShareSuccess("");
  };

  const closeShareModal = () => {
    if (sharing) return;

    setSelectedDocument(null);
    setShareEmail("");
    setShareError("");
    setShareSuccess("");
  };

  // Share document with another registered user
  const handleShare = async (e) => {
    e.preventDefault();

    if (!selectedDocument) return;

    const email = shareEmail.trim().toLowerCase();

    if (!email) {
      setShareError("Please enter the user's email address.");
      return;
    }

    if (email === user?.email?.toLowerCase()) {
      setShareError("You cannot share a document with yourself.");
      return;
    }

    try {
      setSharing(true);
      setShareError("");
      setShareSuccess("");

      const response = await api.post(
        `/documents/${selectedDocument._id}/share`,
        {
          email,
          role: shareRole,
        }
      );

      setShareSuccess(
        response.data.message || "Document shared successfully!"
      );

      // Refresh document data to display updated collaborators
      await fetchDocuments();

      // Refresh the selected document's collaborator information
      const refreshed = await api.get(
        `/documents/${selectedDocument._id}`
      );

      setSelectedDocument(
        refreshed.data.document || selectedDocument
      );

      setShareEmail("");
    } catch (err) {
      setShareError(
        err.response?.data?.message || "Unable to share document."
      );
    } finally {
      setSharing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const ownedDocuments = documents.filter(isOwner);
  const sharedDocuments = documents.filter((doc) => !isOwner(doc));

  const getCollaboratorName = (collaborator) => {
    return (
      collaborator.user?.name ||
      collaborator.user?.email ||
      "Unknown user"
    );
  };

  const getCollaboratorEmail = (collaborator) => {
    return (
      collaborator.user?.email ||
      "Email unavailable"
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 hidden md:flex flex-col">
        <h1 className="text-2xl font-bold text-blue-400">
          DeltaForge
        </h1>

        <p className="text-slate-500 text-xs mt-2">
          COLLABORATIVE WORKSPACE
        </p>

        <div className="mt-10">
          <p className="text-slate-500 text-xs uppercase mb-4">
            Workspace
          </p>

          <div className="bg-blue-600/10 text-blue-400 p-3 rounded-lg flex items-center gap-3">
            <FileText size={18} />
            My Documents
          </div>
        </div>

        <div className="mt-auto border-t border-slate-800 pt-5">
          <p className="text-sm text-slate-300">{user?.name}</p>

          <p className="text-xs text-slate-500 mt-1 break-all">
            {user?.email}
          </p>

          <button
            onClick={handleLogout}
            className="mt-5 flex items-center gap-2 text-red-400 hover:text-red-300"
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold">My Documents</h2>

              <p className="text-slate-400 mt-2">
                Create and manage your collaborative documents.
              </p>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-3 rounded-xl"
            >
              <Plus size={20} />
              {creating ? "Creating..." : "New Document"}
            </button>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-10">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
              <p className="text-slate-400 text-sm">Total Documents</p>
              <h3 className="text-3xl font-bold mt-3">
                {documents.length}
              </h3>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
              <p className="text-slate-400 text-sm">Owned Documents</p>
              <h3 className="text-3xl font-bold mt-3">
                {ownedDocuments.length}
              </h3>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
              <p className="text-slate-400 text-sm">Shared With Me</p>
              <h3 className="text-3xl font-bold mt-3">
                {sharedDocuments.length}
              </h3>
            </div>
          </div>

          {/* Document section */}
          <div className="flex items-center justify-between mt-12 mb-6">
            <h3 className="text-xl font-semibold">Recent Documents</h3>

            <button
              onClick={fetchDocuments}
              disabled={loading}
              className="text-slate-400 hover:text-white disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                size={18}
                className={loading ? "animate-spin" : ""}
              />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-5">
              {error}
            </div>
          )}

          {/* Loading and document cards */}
          {loading ? (
            <p className="text-slate-400">Loading documents...</p>
          ) : documents.length === 0 ? (
            <div className="border border-dashed border-slate-700 rounded-2xl p-12 text-center">
              <FileText
                size={45}
                className="mx-auto text-slate-600"
              />

              <h3 className="text-xl font-semibold mt-5">
                No documents yet
              </h3>

              <p className="text-slate-400 mt-2">
                Create your first document to get started.
              </p>

              <button
                onClick={handleCreate}
                disabled={creating}
                className="mt-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-3 rounded-lg"
              >
                {creating ? "Creating..." : "Create Document"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {documents.map((doc) => {
                const owner = isOwner(doc);
                const editable = canEdit(doc);

                return (
                  <div
                    key={doc._id}
                    className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl p-5 transition"
                  >
                    <div className="flex justify-between items-center">
                      <div className="bg-blue-600/10 p-3 rounded-lg text-blue-400">
                        <FileText size={23} />
                      </div>

                      <div className="flex gap-3">
                        {owner && (
                          <button
                            onClick={() => openShareModal(doc)}
                            title="Share document"
                            className="text-slate-400 hover:text-green-400"
                          >
                            <Share2 size={18} />
                          </button>
                        )}

                        {editable && (
                          <button
                            onClick={() =>
                              handleRename(doc._id, doc.title)
                            }
                            disabled={
                              actionLoading === `rename-${doc._id}`
                            }
                            title="Rename"
                            className="text-slate-400 hover:text-blue-400 disabled:opacity-50"
                          >
                            <Pencil size={17} />
                          </button>
                        )}

                        {owner && (
                          <button
                            onClick={() => handleDelete(doc._id)}
                            disabled={
                              actionLoading === `delete-${doc._id}`
                            }
                            title="Delete"
                            className="text-slate-400 hover:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold mt-5 truncate">
                      {doc.title}
                    </h3>

                    <p className="text-xs text-slate-500 mt-2">
                      Updated:{" "}
                      {doc.updatedAt
                        ? new Date(doc.updatedAt).toLocaleDateString()
                        : "Not available"}
                    </p>

                    <p className="text-xs text-slate-500 mt-1">
                      {owner
                        ? "Owner"
                        : editable
                          ? "Shared · Editor"
                          : "Shared · Viewer"}
                    </p>

                    <button
                      onClick={() =>
                        navigate(`/documents/${doc._id}`)
                      }
                      className="w-full mt-5 bg-slate-800 hover:bg-blue-600 py-2 rounded-lg transition"
                    >
                      Open Document
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Share modal */}
      {selectedDocument && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Share2 size={20} className="text-blue-400" />
                  Share Document
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  {selectedDocument.title}
                </p>
              </div>

              <button
                onClick={closeShareModal}
                disabled={sharing}
                className="text-slate-400 hover:text-white disabled:opacity-50"
                aria-label="Close sharing dialog"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6">
              {shareError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {shareError}
                </div>
              )}

              {shareSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                  {shareSuccess}
                </div>
              )}

              <form onSubmit={handleShare} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    User email address
                  </label>

                  <div className="relative">
                    <Mail
                      size={18}
                      className="absolute left-3 top-3.5 text-slate-500"
                    />

                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="Enter registered email"
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-10 pr-3 text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    Permission
                  </label>

                  <select
                    value={shareRole}
                    onChange={(e) => setShareRole(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500"
                  >
                    <option value="editor">
                      Editor – Can view and edit
                    </option>
                    <option value="viewer">
                      Viewer – Can only view
                    </option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={sharing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg py-3 font-medium"
                >
                  {sharing ? "Sharing..." : "Share Document"}
                </button>
              </form>

              {/* Existing collaborators */}
              <div className="mt-7 border-t border-slate-800 pt-5">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Users size={18} className="text-blue-400" />
                  People with access
                </h3>

                {(selectedDocument.collaborators || []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No collaborators yet.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {selectedDocument.collaborators.map(
                      (collaborator, index) => (
                        <div
                          key={getId(collaborator.user) || index}
                          className="flex items-center justify-between gap-3 bg-slate-800/70 rounded-lg p-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {getCollaboratorName(collaborator)}
                            </p>

                            <p className="text-xs text-slate-400 truncate">
                              {getCollaboratorEmail(collaborator)}
                            </p>
                          </div>

                          <span className="text-xs capitalize text-blue-300 bg-blue-500/10 px-2 py-1 rounded">
                            {collaborator.role}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
