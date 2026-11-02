
import mongoose from "mongoose";
import * as Y from "yjs";

import Document from "../models/Document.js";
import DocumentUpdate from "../models/DocumentUpdate.js";
import DocumentSnapshot from "../models/DocumentSnapshot.js";

// Check whether the supplied ID is a valid MongoDB ObjectId.
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Check whether a user can access or edit a document.
const checkAccess = (document, userId) => {
  const currentUserId = userId.toString();

  const isOwner = document.owner.toString() === currentUserId;

  const collaborator = document.collaborators.find(
    (item) => item.user.toString() === currentUserId
  );

  return {
    allowed: isOwner || Boolean(collaborator),
    canEdit: isOwner || collaborator?.role === "editor",
  };
};

// Convert different MongoDB update representations into Uint8Array.
const toUint8Array = (update) => {
  if (update instanceof Buffer) {
    return new Uint8Array(update);
  }

  if (update instanceof Uint8Array) {
    return update;
  }

  if (update instanceof ArrayBuffer) {
    return new Uint8Array(update);
  }

  if (ArrayBuffer.isView(update)) {
    return new Uint8Array(
      update.buffer,
      update.byteOffset,
      update.byteLength
    );
  }

  // Handle BSON Binary values returned by MongoDB.
  if (update?._bsontype === "Binary") {
    return new Uint8Array(update.value(true));
  }

  // Handle Base64 strings.
  if (typeof update === "string") {
    return new Uint8Array(Buffer.from(update, "base64"));
  }

  // Handle serialized Buffer JSON.
  if (update?.type === "Buffer" && Array.isArray(update.data)) {
    return new Uint8Array(update.data);
  }

  // Handle normal arrays.
  if (Array.isArray(update)) {
    return new Uint8Array(update);
  }

  throw new Error(
    `Unsupported Yjs update format: ${typeof update}`
  );
};

// Rebuild a Yjs document from all persisted updates.
const buildYDocument = async (documentId) => {
  const updates = await DocumentUpdate.find({
    document: documentId,
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("update")
    .lean();

  const ydoc = new Y.Doc();

  try {
    for (let index = 0; index < updates.length; index++) {
      const item = updates[index];

      if (!item.update) {
        continue;
      }

      try {
        const updateBytes = toUint8Array(item.update);

        // Ignore empty updates.
        if (updateBytes.length === 0) {
          continue;
        }

        Y.applyUpdate(ydoc, updateBytes);
      } catch (error) {
        console.error("Invalid Yjs update in snapshot:", {
          index,
          type: typeof item.update,
          bsonType: item.update?._bsontype,
          error: error.message,
        });

        throw error;
      }
    }

    return ydoc;
  } catch (error) {
    ydoc.destroy();
    throw error;
  }
};

// Create a named snapshot of the current persisted document state.
export const createSnapshot = async (req, res) => {
  let ydoc = null;

  try {
    const { id } = req.params;
    const { label } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid document ID",
      });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    const access = checkAccess(document, req.user._id);

    if (!access.allowed || !access.canEdit) {
      return res.status(403).json({
        message: "You cannot create a snapshot",
      });
    }

    // Rebuild the complete Yjs document.
    ydoc = await buildYDocument(id);

    // Encode the complete document state.
    const state = Y.encodeStateAsUpdate(ydoc);

    const snapshotLabel =
      typeof label === "string" && label.trim()
        ? label.trim().slice(0, 100)
        : "Saved version";

    // Save the snapshot in MongoDB.
    const snapshot = await DocumentSnapshot.create({
      document: id,
      createdBy: req.user._id,
      label: snapshotLabel,
      state: Buffer.from(state),
    });

    return res.status(201).json({
      message: "Snapshot created successfully",
      snapshot: {
        id: snapshot._id,
        label: snapshot.label,
        createdAt: snapshot.createdAt,
      },
    });
  } catch (error) {
    console.error("Create snapshot error:", error);

    return res.status(500).json({
      message: "Unable to create snapshot",
    });
  } finally {
    if (ydoc) {
      ydoc.destroy();
    }
  }
};

// Get the version history of a document.
export const getSnapshots = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid document ID",
      });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    const access = checkAccess(document, req.user._id);

    if (!access.allowed) {
      return res.status(403).json({
        message: "You do not have access to this document",
      });
    }

    const snapshots = await DocumentSnapshot.find({
      document: id,
    })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1, _id: -1 })
      .select("-state")
      .lean();

    return res.status(200).json({
      snapshots,
    });
  } catch (error) {
    console.error("Get snapshots error:", error);

    return res.status(500).json({
      message: "Unable to load version history",
    });
  }
};

// Restore a snapshot as a separate new document.
// The original document remains unchanged.
export const restoreSnapshot = async (req, res) => {
  let restoredDocument = null;

  try {
    const { id, snapshotId } = req.params;

    if (!isValidId(id) || !isValidId(snapshotId)) {
      return res.status(400).json({
        message: "Invalid document or snapshot ID",
      });
    }

    const originalDocument = await Document.findById(id);

    if (!originalDocument) {
      return res.status(404).json({
        message: "Original document not found",
      });
    }

    const access = checkAccess(originalDocument, req.user._id);

    if (!access.allowed || !access.canEdit) {
      return res.status(403).json({
        message: "You do not have permission to restore this version",
      });
    }

    const snapshot = await DocumentSnapshot.findOne({
      _id: snapshotId,
      document: id,
    });

    if (!snapshot) {
      return res.status(404).json({
        message: "Snapshot not found",
      });
    }

    if (!snapshot.state || snapshot.state.length === 0) {
      return res.status(400).json({
        message: "Snapshot does not contain a valid document state",
      });
    }

    // Create a separate document owned by the current user.
    restoredDocument = await Document.create({
      title: `${originalDocument.title} (Restored)`,
      owner: req.user._id,
      collaborators: [],
    });

    // Store the snapshot's complete Yjs state as the
    // initial update of the restored document.
    await DocumentUpdate.create({
      document: restoredDocument._id,
      update: Buffer.from(snapshot.state),
    });

    return res.status(201).json({
      message: "Snapshot restored as a new document",
      document: restoredDocument,
    });
  } catch (error) {
    // Remove partially created data if restoration fails.
    if (restoredDocument) {
      try {
        await DocumentUpdate.deleteMany({
          document: restoredDocument._id,
        });

        await Document.findByIdAndDelete(
          restoredDocument._id
        );
      } catch (cleanupError) {
        console.error("Restore cleanup error:", cleanupError);
      }
    }

    console.error("Snapshot restore error:", error);

    return res.status(500).json({
      message: "Unable to restore snapshot",
    });
  }
};
