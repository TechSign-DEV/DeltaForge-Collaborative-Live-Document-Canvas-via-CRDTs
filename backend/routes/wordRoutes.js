import express from "express";
import { exportWordDocument } from "../controllers/wordController.js";

const router = express.Router();

router.post("/export", exportWordDocument);

export default router;