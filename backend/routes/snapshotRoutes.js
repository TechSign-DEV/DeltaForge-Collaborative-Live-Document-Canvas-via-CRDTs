
import express from "express";
import protect from "../middleware/authMiddleware.js";

import {
  createSnapshot,
  getSnapshots,
  restoreSnapshot,
} from "../controllers/snapshotController.js";

const router = express.Router();

router.use(protect);

// Create a new version.
router.post("/:id", createSnapshot);

// Get document version history.
router.get("/:id", getSnapshots);

// Restore a snapshot as a separate document.
router.post("/:id/restore/:snapshotId", restoreSnapshot);

export default router;
