
import mongoose from "mongoose";

import Document from "../models/Document.js";
import User from "../models/User.js";
import DocumentUpdate from "../models/DocumentUpdate.js";
import DocumentSnapshot from "../models/DocumentSnapshot.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const checkOwner = (document, userId) =>
  document.owner.toString() === userId.toString();

const checkEditAccess = (document, userId) => {
  if (checkOwner(document, userId)) return true;

  const collaborator = document.collaborators.find(
    (item) => item.user.toString() === userId.toString()
  );

  return collaborator?.role === "editor";
};

// CREATE DOCUMENT
export const createDocument = async (req, res) => {
  try {
    const { title } = req.body;

    if (title !== undefined && typeof title !== "string") {
      return res.status(400).json({
        message: "Document title must be a string",
      });
    }

    const cleanTitle = title?.trim() || "Untitled Document";

    if (cleanTitle.length > 150) {
      return res.status(400).json({
        message: "Document title cannot exceed 150 characters",
      });
    }

    const document = await Document.create({
      title: cleanTitle,
      owner: req.user._id,
      collaborators: [],
    });

    return res.status(201).json({
      message: "Document created successfully",
      document,
    });
  } catch (error) {
    console.error("Create document error:", error);

    return res.status(500).json({
      message: "Failed to create document",
    });
  }
};

// GET ALL DOCUMENTS AVAILABLE TO THE USER
export const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find({
      $or: [
        { owner: req.user._id },
        { "collaborators.user": req.user._id },
      ],
    })
      .populate("owner", "name email")
      .populate("collaborators.user", "name email")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error("Get documents error:", error);

    return res.status(500).json({
      message: "Failed to fetch documents",
    });
  }
};

// GET SINGLE DOCUMENT
export const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid document ID",
      });
    }

    const document = await Document.findById(id)
      .populate("owner", "name email")
      .populate("collaborators.user", "name email");

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    const userId = req.user._id.toString();

    const isOwner = document.owner?._id.toString() === userId;

    const isCollaborator = document.collaborators.some(
      (item) => item.user?._id.toString() === userId
    );

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({
        message: "You don't have access to this document",
      });
    }

    return res.status(200).json({
      document,
    });
  } catch (error) {
    console.error("Get document error:", error);

    return res.status(500).json({
      message: "Failed to fetch document",
    });
  }
};

// RENAME DOCUMENT
export const renameDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid document ID",
      });
    }

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        message: "A valid document title is required",
      });
    }

    const cleanTitle = title.trim();

    if (cleanTitle.length > 150) {
      return res.status(400).json({
        message: "Document title cannot exceed 150 characters",
      });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    if (!checkEditAccess(document, req.user._id)) {
      return res.status(403).json({
        message: "You cannot rename this document",
      });
    }

    document.title = cleanTitle;

    await document.save();

    return res.status(200).json({
      message: "Document renamed successfully",
      document,
    });
  } catch (error) {
    console.error("Rename document error:", error);

    return res.status(500).json({
      message: "Failed to rename document",
    });
  }
};

// DELETE DOCUMENT
export const deleteDocument = async (req, res) => {
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

    if (!checkOwner(document, req.user._id)) {
      return res.status(403).json({
        message: "Only the owner can delete this document",
      });
    }

    // Remove associated Yjs updates and version snapshots.
    await Promise.all([
      DocumentUpdate.deleteMany({ document: id }),
      DocumentSnapshot.deleteMany({ document: id }),
    ]);

    await document.deleteOne();

    return res.status(200).json({
      message: "Document and its stored versions deleted successfully",
    });
  } catch (error) {
    console.error("Delete document error:", error);

    return res.status(500).json({
      message: "Failed to delete document",
    });
  }
};

// SHARE DOCUMENT
export const shareDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid document ID",
      });
    }

    if (
      typeof email !== "string" ||
      !email.trim() ||
      !["editor", "viewer"].includes(role)
    ) {
      return res.status(400).json({
        message: "Valid email and role are required",
      });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    if (!checkOwner(document, req.user._id)) {
      return res.status(403).json({
        message: "Only the owner can share this document",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const invitedUser = await User.findOne({
      email: normalizedEmail,
    });

    if (!invitedUser) {
      return res.status(404).json({
        message: "User with this email does not exist",
      });
    }

    if (invitedUser._id.equals(document.owner)) {
      return res.status(400).json({
        message: "You are already the document owner",
      });
    }

    const existingCollaborator = document.collaborators.find(
      (item) => item.user.toString() === invitedUser._id.toString()
    );

    if (existingCollaborator) {
      existingCollaborator.role = role;
    } else {
      document.collaborators.push({
        user: invitedUser._id,
        role,
      });
    }

    await document.save();

    return res.status(200).json({
      message: existingCollaborator
        ? "Collaborator role updated successfully"
        : "Document shared successfully",
      document,
    });
  } catch (error) {
    console.error("Share document error:", error);

    return res.status(500).json({
      message: "Failed to share document",
    });
  }
};

// REMOVE COLLABORATOR
export const removeCollaborator = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!isValidId(id) || !isValidId(userId)) {
      return res.status(400).json({
        message: "Valid document ID and collaborator ID are required",
      });
    }

    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    if (!checkOwner(document, req.user._id)) {
      return res.status(403).json({
        message: "Only the owner can remove collaborators",
      });
    }

    const existingCollaborator = document.collaborators.some(
      (item) => item.user.toString() === userId
    );

    if (!existingCollaborator) {
      return res.status(404).json({
        message: "Collaborator not found",
      });
    }

    document.collaborators = document.collaborators.filter(
      (item) => item.user.toString() !== userId
    );

    await document.save();

    return res.status(200).json({
      message: "Collaborator removed successfully",
    });
  } catch (error) {
    console.error("Remove collaborator error:", error);

    return res.status(500).json({
      message: "Failed to remove collaborator",
    });
  }
};
