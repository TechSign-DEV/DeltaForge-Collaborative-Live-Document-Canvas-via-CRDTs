
import { useEffect, useMemo, useRef, useState } from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Upload, FileText, Download } from "lucide-react";

import api from "../services/api";
import useCollaborativeDocument from "../hooks/useCollaborativeDocument";
import { importWordFile } from "../utils/importWord";

const CollaborativeEditor = ({ documentId, onFlushReady }) => {
  const {
    ydoc,
    awareness,
    canEdit,
    activeUsers,
    connectionStatus,
    error,
    flushUpdates,
  } = useCollaborativeDocument(documentId);

  const fileInputRef = useRef(null);

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  // Configure Tiptap collaboration extensions.

const extensions = useMemo(
  () => [
    StarterKit.configure({
      undoRedo: false,
    }),

    // Collaboration
    Collaboration.configure({
      document: ydoc,
      field: "default",
    }),

    CollaborationCaret.configure({
      provider: { awareness },
      user: {
        name: "Collaborator",
        color: "#2563eb",
      },
    }),

    // Text formatting
    Underline,
    TextStyle,
    Color,

    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),

    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),

    // Images
    Image,

    // Tables
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  [ydoc, awareness]
);

   

  // Initialize editor.
  const editor = useEditor(
    {
      extensions,
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "min-h-[500px] w-full outline-none px-6 py-5 text-gray-800 leading-7",
        },
      },
    },
    [ydoc, awareness]
  );

  // Update editor permissions.
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  // Update collaborator cursor identity.
  useEffect(() => {
    if (!editor) return;

    const updateCaretUser = () => {
      const user = awareness.getLocalState()?.user;

      if (user) {
        editor.commands.updateUser({
          name: user.name || "Collaborator",
          color: user.color || "#2563eb",
        });
      }
    };

    awareness.on("change", updateCaretUser);
    updateCaretUser();

    return () => {
      awareness.off("change", updateCaretUser);
    };
  }, [editor, awareness]);

  // Expose synchronization function to DocumentPage.
  useEffect(() => {
    if (!onFlushReady) return;

    onFlushReady(flushUpdates);

    return () => {
      onFlushReady(null);
    };
  }, [flushUpdates, onFlushReady]);

  // Execute toolbar commands.
  const runCommand = (command) => {
    if (!editor || !canEdit) return;

    command(editor.chain().focus()).run();
  };
  

const handleExportWord = async () => {
  if (!editor) {
    alert("Editor is not ready.");
    return;
  }

  try {
    const html = editor.getHTML();

    if (!editor.getText().trim()) {
      alert("There is no document content to export.");
      return;
    }

    const response = await api.post(
      "/word/export",
      { html },
      {
        responseType: "blob",
      }
    );

    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `deltaforge-document-${documentId}.docx`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
  window.URL.revokeObjectURL(url);
}, 1000);
  } catch (error) {
    console.error("Word export error:", error);

    alert("Word export failed. Please check the backend terminal.");
  }
};



  // Open the system file picker.
  const handleImportClick = () => {
    if (!canEdit || importing) return;

    setImportError("");
    setImportMessage("");

    fileInputRef.current?.click();
  };

  // Import Word document into the collaborative editor.
  const handleWordImport = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      if (!editor || !canEdit) {
        throw new Error("You do not have permission to import documents.");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Please select a Word document smaller than 10 MB.");
      }

      // Ask before replacing existing content.
      const hasExistingContent =
        editor.getText().trim().length > 0;

      if (
        hasExistingContent &&
        !window.confirm(
          "Importing this Word document will replace the current document content. Continue?"
        )
      ) {
        event.target.value = "";
        return;
      }

      setImporting(true);
      setImportError("");
      setImportMessage("Importing Word document...");

      const result = await importWordFile(file);

      // Insert imported HTML into the shared Tiptap/Yjs document.
      const success = editor.commands.setContent(result.html);

      if (!success) {
        throw new Error("Unable to insert the Word document content.");
      }

      // Persist the imported Yjs updates.
      await flushUpdates();

      setImportMessage(
        `Successfully imported ${file.name}`
      );

      if (result.messages?.length > 0) {
        console.warn("Word import conversion messages:", result.messages);
      }
    } catch (err) {
      console.error("Word import error:", err);

      setImportError(
        err.message || "Failed to import Word document."
      );

      setImportMessage("");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

      {/* Hidden Word file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleWordImport}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">

        {/* Import Word */}
        <button
          type="button"
          disabled={!canEdit || !editor || importing}
          onClick={handleImportClick}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload size={16} />
          {importing ? "Importing..." : "Import Word"}
        </button>
<button
  type="button"
  disabled={!editor}
  onClick={handleExportWord}
  className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
>
  <Download size={16} />
  Export Word
</button>
        <div className="mx-1 h-7 border-l border-gray-300" />

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) => chain.toggleBold())
          }
          className="rounded border px-3 py-1.5 text-sm font-bold disabled:opacity-40"
          title="Bold"
        >
          B
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) => chain.toggleItalic())
          }
          className="rounded border px-3 py-1.5 text-sm italic disabled:opacity-40"
          title="Italic"
        >
          I
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) =>
              chain.toggleHeading({ level: 1 })
            )
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          title="Heading 1"
        >
          H1
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) =>
              chain.toggleHeading({ level: 2 })
            )
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          title="Heading 2"
        >
          H2
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) => chain.toggleBulletList())
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          title="Bullet list"
        >
          • List
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) => chain.toggleOrderedList())
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          title="Ordered list"
        >
          1. List
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) => chain.toggleBlockquote())
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          title="Blockquote"
        >
          Quote
        </button>

        <button
          type="button"
          disabled={!canEdit || !editor}
          onClick={() =>
            runCommand((chain) => chain.setParagraph())
          }
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          title="Paragraph"
        >
          Paragraph
        </button>

{/* Underline */}
<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() =>
    runCommand((chain) => chain.toggleUnderline())
  }
  className="rounded border px-3 py-1.5 text-sm underline disabled:opacity-40"
  title="Underline"
>
  U
</button>

{/* Strikethrough */}
<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() =>
    runCommand((chain) => chain.toggleStrike())
  }
  className="rounded border px-3 py-1.5 text-sm line-through disabled:opacity-40"
  title="Strikethrough"
>
  S
</button>

{/* Text alignment */}
<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() =>
    runCommand((chain) => chain.setTextAlign("left"))
  }
  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
>
  Left
</button>

<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() =>
    runCommand((chain) => chain.setTextAlign("center"))
  }
  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
>
  Center
</button>

<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() =>
    runCommand((chain) => chain.setTextAlign("right"))
  }
  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
>
  Right
</button>

{/* Text color */}
<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() => {
    const color = window.prompt("Enter a color (example: #ff0000)");
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      runCommand((chain) => chain.setColor(color));
    }
  }}
  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
>
  Text Color
</button>

{/* Add hyperlink */}
<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() => {
    const url = window.prompt("Enter hyperlink URL:");
    if (url && /^https?:\/\//i.test(url)) {
      runCommand((chain) =>
        chain.setLink({ href: url })
      );
    }
  }}
  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
>
  Link
</button>

{/* Insert table */}
<button
  type="button"
  disabled={!canEdit || !editor}
  onClick={() => {
    editor.chain().focus().insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    }).run();
  }}
  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
>
  Insert Table
</button>

{/* Insert image using URL */}


      </div>

      {/* Import feedback */}
      {importMessage && (
        <div className="border-b border-green-100 bg-green-50 px-4 py-2 text-sm text-green-700">
          <FileText size={15} className="mr-2 inline" />
          {importMessage}
        </div>
      )}

      {importError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {importError}
        </div>
      )}

      {/* Connection and permission status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 text-xs">

        <span>
          Connection:{" "}
          <strong
            className={
              connectionStatus === "connected"
                ? "text-green-600"
                : connectionStatus === "reconnecting"
                  ? "text-orange-600"
                  : "text-red-600"
            }
          >
            {connectionStatus}
          </strong>
        </span>

        <span
          className={
            canEdit ? "text-green-600" : "text-gray-500"
          }
        >
          {canEdit ? "Editor access" : "Read-only access"}
        </span>

      </div>

      {/* Active collaborators */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">

        <span className="text-sm font-medium text-gray-600">
          Active collaborators:
        </span>

        {activeUsers.length === 0 ? (
          <span className="text-sm text-gray-400">
            No other users online
          </span>
        ) : (
          activeUsers.map((user) => (
            <span
              key={user.id}
              className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
            >
              {user.name}
            </span>
          ))
        )}

      </div>

      {/* Existing collaboration error */}
      {error && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Read-only information */}
      {!canEdit && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
          You have read-only access to this document.
        </div>
      )}

    </div>
  );
};

export default CollaborativeEditor;
