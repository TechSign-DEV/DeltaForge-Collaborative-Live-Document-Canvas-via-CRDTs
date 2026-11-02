
import "dotenv/config";

import express from "express";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import { connectRedis } from "./services/redisService.js";

import authRoutes from "./routes/authRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import snapshotRoutes from "./routes/snapshotRoutes.js";
import wordRoutes from "./routes/wordRoutes.js";
import { registerDocumentSocket } from "./sockets/documentSocket.js";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL;

// Validate required environment variables.
const requiredEnv = [
  "MONGO_URI",
  "REDIS_URL",
  "JWT_SECRET",
  "CLIENT_URL",
];

const validateEnvironment = () => {
  const missing = requiredEnv.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}`
    );
  }
};

// Express middleware.
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "6mb" }));

// API routes.
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/snapshots", snapshotRoutes);
app.use("/api/word", wordRoutes);
// Root endpoint.
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to DeltaForge API",
    status: "Running",
  });
});

// Health endpoint.
app.get("/health", (req, res) => {
  res.status(200).json({
    application: "DeltaForge",
    status: "Running",
    database:
      mongoose.connection.readyState === 1
        ? "Connected"
        : "Disconnected",
  });
});

// Socket.IO configuration.
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Start the application.
const startServer = async () => {
  try {
    validateEnvironment();

    // 1. Connect MongoDB.
    await connectDB();
    console.log("MongoDB connected successfully");

    // 2. Connect Redis and configure Socket.IO adapter.
    await connectRedis(io);
    console.log("Redis connected successfully");

    // 3. Register Socket.IO document events.
    registerDocumentSocket(io);
    console.log("Document socket handlers registered");

    // 4. Start HTTP server.
    server.listen(PORT, () => {
      console.log(
        `DeltaForge server running on port ${PORT}`
      );
      console.log(`API: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);

    server.close();

    process.exit(1);
  }
};

// Handle unexpected server errors.
server.on("error", (error) => {
  console.error("HTTP server error:", error);
});

// Graceful shutdown.
const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down DeltaForge...`);

  try {
    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await mongoose.disconnect();

    console.log("DeltaForge shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
