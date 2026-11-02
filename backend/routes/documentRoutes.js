
import express from "express";

import protect from "../middleware/authMiddleware.js";

import {
  createDocument,
  getDocuments,
  getDocumentById,
  renameDocument,
  deleteDocument,
  shareDocument,
  removeCollaborator,
} from "../controllers/documentController.js";

const router = express.Router();

router.use(protect);

router.post("/", createDocument);
router.get("/", getDocuments);
router.get("/:id", getDocumentById);
router.put("/:id/rename", renameDocument);
router.delete("/:id", deleteDocument);
router.post("/:id/share", shareDocument);
router.delete("/:id/collaborators", removeCollaborator);

export default router;
