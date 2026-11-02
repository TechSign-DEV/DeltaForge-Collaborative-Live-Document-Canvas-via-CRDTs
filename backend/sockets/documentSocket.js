
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Document from "../models/Document.js";
import DocumentUpdate from "../models/DocumentUpdate.js";

const getRoomName = (documentId) => `document:${documentId}`;

const toBuffer = (update) => {
  if (Buffer.isBuffer(update)) {
    return update;
  }

  if (update instanceof ArrayBuffer) {
    return Buffer.from(update);
  }

  if (ArrayBuffer.isView(update)) {
    return Buffer.from(
      update.buffer,
      update.byteOffset,
      update.byteLength
    );
  }

  if (Array.isArray(update)) {
    return Buffer.from(update);
  }

  if (update?.type === "Buffer" && Array.isArray(update.data)) {
    return Buffer.from(update.data);
  }

  throw new Error("Invalid binary update format");
};

const hasDocumentAccess = async (document, userId) => {
  const currentUserId = userId.toString();

  const isOwner =
    document.owner.toString() === currentUserId;

  if (isOwner) {
    return {
      allowed: true,
      canEdit: true,
    };
  }

  const collaborator = document.collaborators.find(
    (item) => item.user.toString() === currentUserId
  );

  if (!collaborator) {
    return {
      allowed: false,
      canEdit: false,
    };
  }

  return {
    allowed: true,
    canEdit: collaborator.role === "editor",
  };
};

const getSocketUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
});

const isSocketInRoom = async (io, room, socketId) => {
  const roomSockets = await io.in(room).fetchSockets();

  return roomSockets.some((item) => item.id === socketId);
};

export const registerDocumentSocket = (io) => {
  // ------------------------------------------
  // 1. SOCKET AUTHENTICATION
  // ------------------------------------------

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      const user = await User.findById(decoded.id).select(
        "-password"
      );

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.data.user = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
      };

      next();
    } catch (error) {
      console.error(
        "Socket authentication error:",
        error.message
      );

      next(new Error("Invalid or expired token"));
    }
  });

  // ------------------------------------------
  // 2. CONNECTION
  // ------------------------------------------

  io.on("connection", (socket) => {
    console.log(
      `Socket connected: ${socket.data.user.email}`
    );

    // ------------------------------------------
    // 3. JOIN DOCUMENT
    // ------------------------------------------

    socket.on("document:join", async ({ documentId } = {}) => {
      try {
        if (
          typeof documentId !== "string" ||
          !/^[a-f\d]{24}$/i.test(documentId)
        ) {
          return socket.emit("document:error", {
            message: "Invalid document ID",
          });
        }

        const document = await Document.findById(documentId);

        if (!document) {
          return socket.emit("document:error", {
            message: "Document not found",
          });
        }

        const access = await hasDocumentAccess(
          document,
          socket.data.user._id
        );

        if (!access.allowed) {
          return socket.emit("document:error", {
            message: "You do not have access to this document",
          });
        }

        // Leave the previous document room if necessary.
        const previousDocumentId = socket.data.documentId;

        if (previousDocumentId) {
          const previousRoom = getRoomName(previousDocumentId);

          socket.to(previousRoom).emit("presence:left", {
            id: socket.data.user._id,
          });

          socket.leave(previousRoom);
        }

        const room = getRoomName(documentId);

        await socket.join(room);

        socket.data.documentId = documentId;
        socket.data.canEdit = access.canEdit;

        // ------------------------------------------
        // 4. LOAD SAVED YJS UPDATES FROM MONGODB
        // ------------------------------------------

        const savedUpdates = await DocumentUpdate.find({
          document: documentId,
        })
          .sort({ createdAt: 1, _id: 1 })
          .select("update")
          .lean();

        socket.emit("document:load", {
          updates: savedUpdates.map((item) => item.update),
        });

        // ------------------------------------------
        // 5. GET ACTIVE USERS
        // ------------------------------------------

        const existingSockets = await io
          .in(room)
          .fetchSockets();

        const activeUsersMap = new Map();

        existingSockets.forEach((item) => {
          if (item.id === socket.id) return;

          const user = item.data.user;

          if (user) {
            activeUsersMap.set(
              user._id,
              getSocketUser(user)
            );
          }
        });

        const activeUsers = Array.from(
          activeUsersMap.values()
        );

        // ------------------------------------------
        // 6. CONFIRM DOCUMENT JOIN
        // ------------------------------------------

        socket.emit("document:joined", {
          documentId,
          canEdit: access.canEdit,
          user: {
            id: socket.data.user._id,
            name: socket.data.user.name,
            email: socket.data.user.email,
          },
          activeUsers,
        });

        // Notify existing collaborators.
        socket.to(room).emit("presence:joined", {
          id: socket.data.user._id,
          name: socket.data.user.name,
          email: socket.data.user.email,
        });

        // ------------------------------------------
        // 7. REQUEST CURRENT YJS STATE
        // ------------------------------------------

        socket.to(room).emit("document:sync-request", {
          requesterSocketId: socket.id,
        });

        // ------------------------------------------
        // 8. REQUEST CURRENT AWARENESS STATE
        // ------------------------------------------

        socket.to(room).emit("awareness:sync-request", {
          requesterSocketId: socket.id,
        });
      } catch (error) {
        console.error("Document join error:", error);

        socket.emit("document:error", {
          message: "Unable to join document",
        });
      }
    });

    // ------------------------------------------
    // 9. YJS STATE SYNCHRONIZATION
    // ------------------------------------------

    socket.on(
      "document:sync-state",
      async ({ targetSocketId, update } = {}) => {
        try {
          const documentId = socket.data.documentId;

          if (!documentId || !targetSocketId || !update) {
            return;
          }

          const document = await Document.findById(documentId);

          if (!document) return;

          const access = await hasDocumentAccess(
            document,
            socket.data.user._id
          );

          if (!access.allowed) return;

          const updateBuffer = toBuffer(update);

          if (
            updateBuffer.length === 0 ||
            updateBuffer.length > 1024 * 1024
          ) {
            return;
          }

          const room = getRoomName(documentId);

          const targetExists = await isSocketInRoom(
            io,
            room,
            targetSocketId
          );

          if (!targetExists) return;

          io.to(targetSocketId).emit("document:sync-state", {
            update: updateBuffer,
          });
        } catch (error) {
          console.error(
            "Document sync-state error:",
            error.message
          );
        }
      }
    );

    // ------------------------------------------
    // 10. RECEIVE AND SAVE DOCUMENT UPDATES
    // ------------------------------------------

    socket.on(
      "document:update",
      async ({ update } = {}, acknowledge) => {
        const respond = (result) => {
          if (typeof acknowledge === "function") {
            acknowledge(result);
          }
        };

        try {
          const documentId = socket.data.documentId;

          if (!documentId || !update) {
            return respond({
              success: false,
              message: "Document ID or update is missing",
            });
          }

          const room = getRoomName(documentId);

          if (!socket.rooms.has(room)) {
            return respond({
              success: false,
              message: "Socket is not in the document room",
            });
          }

          const document = await Document.findById(documentId);

          if (!document) {
            return respond({
              success: false,
              message: "Document not found",
            });
          }

          const access = await hasDocumentAccess(
            document,
            socket.data.user._id
          );

          if (!access.allowed || !access.canEdit) {
            return respond({
              success: false,
              message: "You do not have permission to edit this document",
            });
          }

          const updateBuffer = toBuffer(update);

          if (
            updateBuffer.length === 0 ||
            updateBuffer.length > 1024 * 1024
          ) {
            return respond({
              success: false,
              message: "Invalid or oversized document update",
            });
          }

          // Save to MongoDB before acknowledging or broadcasting.
          await DocumentUpdate.create({
            document: documentId,
            update: updateBuffer,
          });

          socket.to(room).emit("document:update", {
            update: updateBuffer,
          });

          respond({ success: true });
        } catch (error) {
          console.error("Document update error:", error);

          respond({
            success: false,
            message: "Unable to save document update",
          });

          socket.emit("document:error", {
            message: "Unable to save document update",
          });
        }
      }
    );

    // ------------------------------------------
    // 11. AWARENESS UPDATE
    // ------------------------------------------

    socket.on(
      "awareness:update",
      async ({ update } = {}) => {
        try {
          const documentId = socket.data.documentId;

          if (!documentId || !update) return;

          const room = getRoomName(documentId);

          if (!socket.rooms.has(room)) return;

          const document = await Document.findById(documentId);

          if (!document) return;

          const access = await hasDocumentAccess(
            document,
            socket.data.user._id
          );

          if (!access.allowed) return;

          const updateBuffer = toBuffer(update);

          if (
            updateBuffer.length === 0 ||
            updateBuffer.length > 64 * 1024
          ) {
            return;
          }

          // Awareness is temporary state; do not save it to MongoDB.
          socket.to(room).emit("awareness:update", {
            update: updateBuffer,
          });
        } catch (error) {
          console.error(
            "Awareness update error:",
            error.message
          );
        }
      }
    );

    // ------------------------------------------
    // 12. AWARENESS STATE SYNCHRONIZATION
    // ------------------------------------------

    // An existing collaborator sends their current awareness
    // state directly to the newly joined collaborator.
    socket.on(
      "awareness:sync-state",
      async ({ targetSocketId, update } = {}) => {
        try {
          const documentId = socket.data.documentId;

          if (!documentId || !targetSocketId || !update) {
            return;
          }

          const room = getRoomName(documentId);

          if (!socket.rooms.has(room)) return;

          const document = await Document.findById(documentId);

          if (!document) return;

          const access = await hasDocumentAccess(
            document,
            socket.data.user._id
          );

          if (!access.allowed) return;

          const targetExists = await isSocketInRoom(
            io,
            room,
            targetSocketId
          );

          if (!targetExists) return;

          const updateBuffer = toBuffer(update);

          if (
            updateBuffer.length === 0 ||
            updateBuffer.length > 64 * 1024
          ) {
            return;
          }

          io.to(targetSocketId).emit("awareness:sync-state", {
            update: updateBuffer,
          });
        } catch (error) {
          console.error(
            "Awareness sync-state error:",
            error.message
          );
        }
      }
    );

    // ------------------------------------------
    // 13. DISCONNECTING
    // ------------------------------------------

    socket.on("disconnecting", () => {
      const documentId = socket.data.documentId;

      if (documentId) {
        socket.to(getRoomName(documentId)).emit("presence:left", {
          id: socket.data.user._id,
        });
      }
    });

    // ------------------------------------------
    // 14. DISCONNECTED
    // ------------------------------------------

    socket.on("disconnect", (reason) => {
      console.log(
        `Socket disconnected: ${socket.data.user.email} (${reason})`
      );
    });
  });
};
