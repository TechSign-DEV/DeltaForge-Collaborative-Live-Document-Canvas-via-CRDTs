
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { io } from "socket.io-client";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness";

const SOCKET_URL = "http://localhost:5000";

// Convert Socket.IO binary data into Uint8Array.
const toUint8Array = (update) => {
  // Handle Uint8Array
  if (update instanceof Uint8Array) {
    return update;
  }

  // Handle ArrayBuffer
  if (update instanceof ArrayBuffer) {
    return new Uint8Array(update);
  }

  // Handle other typed arrays
  if (ArrayBuffer.isView(update)) {
    return new Uint8Array(
      update.buffer,
      update.byteOffset,
      update.byteLength
    );
  }

  // Handle regular arrays
  if (Array.isArray(update)) {
    return new Uint8Array(update);
  }

  // Handle Node.js Buffer JSON format
  if (update?.type === "Buffer" && Array.isArray(update.data)) {
    return new Uint8Array(update.data);
  }

  // Handle Base64 strings from MongoDB
  if (typeof update === "string") {
    const binary = atob(update);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  // Handle BSON Binary
  if (update?._bsontype === "Binary") {
    return new Uint8Array(update.value(true));
  }

  throw new Error("Invalid Yjs update format");
};
 

const useCollaborativeDocument = (documentId) => {
  // One Yjs document per opened document.
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);

  // Awareness contains temporary collaborator and cursor information.
  const awareness = useMemo(
    () => new Awareness(ydoc),
    [ydoc]
  );

  const [socket, setSocket] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [connectionStatus, setConnectionStatus] =
    useState("connecting");
  const [error, setError] = useState("");

  const flushRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("deltaforge_token");

    if (!token) {
      setError("Please log in again.");
      setConnectionStatus("disconnected");
      return;
    }

    let disposed = false;
    let joined = false;
    let serverLoaded = false;
    let userCanEdit = false;
    let localStateSent = false;
    let localStateSending = false;

    // Tracks updates waiting for MongoDB acknowledgement.
    const pendingUpdates = new Set();

    // Local offline persistence.
    const persistence = new IndexeddbPersistence(
      `deltaforge-${documentId}`,
      ydoc
    );

    // Socket.IO connection.
    const socketConnection = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    setSocket(socketConnection);

    // ------------------------------------------
    // 1. SAVE YJS UPDATE AND WAIT FOR ACK
    // ------------------------------------------

    const persistUpdate = (update) => {
      if (!socketConnection.connected || !joined) {
        return Promise.reject(
          new Error("Document is not connected.")
        );
      }

      const updatePromise = new Promise((resolve, reject) => {
        socketConnection.timeout(10000).emit(
          "document:update",
          { update },
          (timeoutError, response) => {
            if (timeoutError) {
              reject(
                new Error(
                  "Server did not acknowledge the update."
                )
              );
              return;
            }

            if (!response?.success) {
              reject(
                new Error(
                  response?.message || "Failed to save update."
                )
              );
              return;
            }

            resolve();
          }
        );
      });

      pendingUpdates.add(updatePromise);

      updatePromise.then(
        () => pendingUpdates.delete(updatePromise),
        () => pendingUpdates.delete(updatePromise)
      );

      return updatePromise;
    };

    // ------------------------------------------
    // 2. SEND LOCAL YJS STATE
    // ------------------------------------------

    const sendLocalStateIfReady = async () => {
      if (
        !joined ||
        !serverLoaded ||
        !userCanEdit ||
        localStateSent ||
        localStateSending ||
        !socketConnection.connected
      ) {
        return;
      }

      localStateSending = true;

      try {
        const fullState = Y.encodeStateAsUpdate(ydoc);

        await persistUpdate(fullState);

        localStateSent = true;
        setError("");
      } catch (err) {
        localStateSent = false;

        setError(
          err.message || "Unable to synchronize local changes."
        );

        throw err;
      } finally {
        localStateSending = false;
      }
    };

    // ------------------------------------------
    // 3. FLUSH PENDING UPDATES
    // ------------------------------------------

    const flushPendingUpdates = async () => {
      if (
        !socketConnection.connected ||
        !joined ||
        !serverLoaded
      ) {
        throw new Error(
          "Document is not fully connected. Please wait for synchronization."
        );
      }

      if (!userCanEdit) {
        throw new Error(
          "You do not have permission to save this document."
        );
      }

      // Recover local/offline changes first.
      if (!localStateSent) {
        await sendLocalStateIfReady();
      }

      // Wait for all currently pending updates.
      while (pendingUpdates.size > 0) {
        await Promise.all([...pendingUpdates]);
      }

      if (
        disposed ||
        !socketConnection.connected ||
        !joined
      ) {
        throw new Error(
          "Connection was interrupted while saving changes."
        );
      }
    };

    // Expose flushUpdates to DocumentPage.
    flushRef.current = flushPendingUpdates;

    // ------------------------------------------
    // 4. HANDLE LOCAL YJS UPDATES
    // ------------------------------------------

    const handleLocalUpdate = (update, origin) => {
      // Ignore updates received from the server.
      if (origin === socketConnection) return;

      // Offline changes are retained by IndexedDB.
      if (!joined || !socketConnection.connected) return;

      persistUpdate(update)
        .then(() => {
          setError("");
        })
        .catch((err) => {
          // A full-state synchronization can recover the changes.
          localStateSent = false;

          console.error("Update persistence error:", err);

          setError(
            err.message || "Unable to save document changes."
          );
        });
    };

    // ------------------------------------------
    // 5. APPLY REMOTE YJS UPDATE
    // ------------------------------------------

    const handleRemoteUpdate = ({ update } = {}) => {
      try {
        if (!update) return;

        Y.applyUpdate(
          ydoc,
          toUint8Array(update),
          socketConnection
        );
      } catch (err) {
        console.error("Remote Yjs update error:", err);
        setError("Unable to synchronize document changes.");
      }
    };

    // ------------------------------------------
    // 6. RESTORE SAVED DOCUMENT UPDATES
    // ------------------------------------------

   const handleDocumentLoad = ({ updates = [] } = {}) => {
  console.log("DELTAFORGE: document:load received");
  console.log("Saved updates:", updates.length);

  try {
  updates.forEach((update, index) => {
  try {
    const converted = toUint8Array(update);

    Y.applyUpdate(ydoc, converted, socketConnection);
  } catch (err) {
    console.error("INVALID UPDATE INDEX:", index);
    console.error("INVALID UPDATE VALUE:", update);
    console.error("UPDATE KEYS:", Object.keys(update || {}));
    console.error("UPDATE TYPE:", update?.constructor?.name);
    console.error("UPDATE BSON TYPE:", update?._bsontype);

    throw err;
  }
});
    

    serverLoaded = true;

    console.log("DELTAFORGE: serverLoaded =", serverLoaded);
    console.log("DELTAFORGE: joined =", joined);

    sendLocalStateIfReady().catch((err) => {
      console.error("Initial synchronization error:", err);
    });
  } catch (err) {
    console.error("Document restoration error:", err);
    setError("Unable to restore saved document content.");
  }
};

    // ------------------------------------------
    // 7. YJS STATE SYNCHRONIZATION
    // ------------------------------------------

    const handleSyncRequest = ({ requesterSocketId } = {}) => {
      if (!joined || !requesterSocketId) return;

      const update = Y.encodeStateAsUpdate(ydoc);

      socketConnection.emit("document:sync-state", {
        targetSocketId: requesterSocketId,
        update,
      });
    };

    const handleSyncState = ({ update } = {}) => {
      try {
        if (!update) return;

        Y.applyUpdate(
          ydoc,
          toUint8Array(update),
          socketConnection
        );
      } catch (err) {
        console.error("Yjs state synchronization error:", err);
      }
    };

    // ------------------------------------------
    // 8. DOCUMENT JOIN CONFIRMATION
    // ------------------------------------------

    const handleJoined = (data) => {
      joined = true;
      userCanEdit = Boolean(data.canEdit);

      setCanEdit(userCanEdit);
      setActiveUsers(data.activeUsers || []);
      setError("");

      // Identify this collaborator in awareness.
      awareness.setLocalStateField("user", {
        name: data.user?.name || "Collaborator",
        color: "#2563eb",
      });

      sendLocalStateIfReady().catch((err) => {
        console.error(
          "Initial state synchronization error:",
          err
        );
      });
    };

    // ------------------------------------------
    // 9. PRESENCE EVENTS
    // ------------------------------------------

    const handlePresenceJoined = (user) => {
      if (!user?.id) return;

      setActiveUsers((previous) => {
        if (previous.some((item) => item.id === user.id)) {
          return previous;
        }

        return [...previous, user];
      });
    };

    const handlePresenceLeft = ({ id } = {}) => {
      if (!id) return;

      setActiveUsers((previous) =>
        previous.filter((user) => user.id !== id)
      );
    };

    // ------------------------------------------
    // 10. LOCAL AWARENESS UPDATES
    // ------------------------------------------

    const handleLocalAwarenessUpdate = (
      { added, updated, removed },
      origin
    ) => {
      if (origin === socketConnection || !joined) return;

      const changedClients = [
        ...added,
        ...updated,
        ...removed,
      ];

      if (changedClients.length === 0) return;

      const update = encodeAwarenessUpdate(
        awareness,
        changedClients
      );

      socketConnection.emit("awareness:update", {
        update,
      });
    };

    // ------------------------------------------
    // 11. REMOTE AWARENESS UPDATES
    // ------------------------------------------

    const handleRemoteAwarenessUpdate = ({ update } = {}) => {
      try {
        if (!update) return;

        applyAwarenessUpdate(
          awareness,
          toUint8Array(update),
          socketConnection
        );
      } catch (err) {
        console.error("Remote awareness error:", err);
      }
    };

    // ------------------------------------------
    // 12. AWARENESS SYNCHRONIZATION REQUEST
    // ------------------------------------------

    // Existing collaborators receive this request when
    // a new collaborator joins the document.
    const handleAwarenessSyncRequest = ({
      requesterSocketId,
    } = {}) => {
      if (
        !joined ||
        !socketConnection.connected ||
        !requesterSocketId
      ) {
        return;
      }

      // Send only this client's own awareness state.
      // This avoids relaying other collaborators' states.
      const localState = awareness.getLocalState();

      if (!localState) return;

      const update = encodeAwarenessUpdate(
        awareness,
        [awareness.clientID]
      );

      socketConnection.emit("awareness:sync-state", {
        targetSocketId: requesterSocketId,
        update,
      });
    };

    // ------------------------------------------
    // 13. APPLY INITIAL AWARENESS STATE
    // ------------------------------------------

    // The newly joined collaborator receives the current
    // awareness state directly from existing collaborators.
    const handleAwarenessSyncState = ({ update } = {}) => {
      try {
        if (!update) return;

        applyAwarenessUpdate(
          awareness,
          toUint8Array(update),
          socketConnection
        );
      } catch (err) {
        console.error(
          "Initial awareness synchronization error:",
          err
        );
      }
    };

    // ------------------------------------------
    // 14. SERVER DOCUMENT ERRORS
    // ------------------------------------------

    const handleDocumentError = ({ message } = {}) => {
      setError(message || "Document connection error.");
    };

    // ------------------------------------------
    // 15. SOCKET CONNECTION
    // ------------------------------------------

    const handleConnect = () => {
      joined = false;
      serverLoaded = false;
      localStateSent = false;
      localStateSending = false;

      setConnectionStatus("connected");

      socketConnection.emit("document:join", {
        documentId,
      });
    };

    const handleDisconnect = () => {
      joined = false;
      serverLoaded = false;
      localStateSent = false;
      localStateSending = false;

      setConnectionStatus("reconnecting");
      setActiveUsers([]);
    };

    const handleConnectError = (err) => {
      setConnectionStatus("disconnected");

      setError(
        err.message || "Unable to connect to the server."
      );
    };

    // ------------------------------------------
    // 16. REGISTER YJS LISTENERS
    // ------------------------------------------

    ydoc.on("update", handleLocalUpdate);

    // ------------------------------------------
    // 17. REGISTER AWARENESS LISTENERS
    // ------------------------------------------

    awareness.on("update", handleLocalAwarenessUpdate);

    // ------------------------------------------
    // 18. REGISTER SOCKET LISTENERS
    // ------------------------------------------

    socketConnection.on("connect", handleConnect);
    socketConnection.on("disconnect", handleDisconnect);
    socketConnection.on("connect_error", handleConnectError);

    socketConnection.on("document:joined", handleJoined);
    socketConnection.on("document:load", handleDocumentLoad);
    socketConnection.on("document:update", handleRemoteUpdate);

    socketConnection.on(
      "document:sync-request",
      handleSyncRequest
    );

    socketConnection.on(
      "document:sync-state",
      handleSyncState
    );

    socketConnection.on(
      "presence:joined",
      handlePresenceJoined
    );

    socketConnection.on(
      "presence:left",
      handlePresenceLeft
    );

    socketConnection.on(
      "awareness:update",
      handleRemoteAwarenessUpdate
    );

    // New awareness synchronization listeners.
    socketConnection.on(
      "awareness:sync-request",
      handleAwarenessSyncRequest
    );

    socketConnection.on(
      "awareness:sync-state",
      handleAwarenessSyncState
    );

    socketConnection.on(
      "document:error",
      handleDocumentError
    );

    // ------------------------------------------
    // 19. WAIT FOR INDEXEDDB BEFORE CONNECTING
    // ------------------------------------------

    persistence.whenSynced
      .then(() => {
        if (!disposed) {
          socketConnection.connect();
        }
      })
      .catch((err) => {
        console.error("IndexedDB synchronization error:", err);

        if (!disposed) {
          socketConnection.connect();
        }
      });

    // ------------------------------------------
    // 20. CLEANUP
    // ------------------------------------------

    return () => {
      disposed = true;
      flushRef.current = null;

      ydoc.off("update", handleLocalUpdate);

      awareness.off(
        "update",
        handleLocalAwarenessUpdate
      );

      socketConnection.off("connect", handleConnect);
      socketConnection.off("disconnect", handleDisconnect);
      socketConnection.off(
        "connect_error",
        handleConnectError
      );

      socketConnection.off("document:joined", handleJoined);
      socketConnection.off(
        "document:load",
        handleDocumentLoad
      );

      socketConnection.off(
        "document:update",
        handleRemoteUpdate
      );

      socketConnection.off(
        "document:sync-request",
        handleSyncRequest
      );

      socketConnection.off(
        "document:sync-state",
        handleSyncState
      );

      socketConnection.off(
        "presence:joined",
        handlePresenceJoined
      );

      socketConnection.off(
        "presence:left",
        handlePresenceLeft
      );

      socketConnection.off(
        "awareness:update",
        handleRemoteAwarenessUpdate
      );

      socketConnection.off(
        "awareness:sync-request",
        handleAwarenessSyncRequest
      );

      socketConnection.off(
        "awareness:sync-state",
        handleAwarenessSyncState
      );

      socketConnection.off(
        "document:error",
        handleDocumentError
      );

      socketConnection.disconnect();

      persistence.destroy();
      awareness.destroy();
      ydoc.destroy();
    };
  }, [documentId, ydoc, awareness]);

  // ------------------------------------------
  // PUBLIC SNAPSHOT FLUSH FUNCTION
  // ------------------------------------------

  const flushUpdates = useCallback(async () => {
    if (!flushRef.current) {
      throw new Error(
        "Document synchronization is not ready."
      );
    }

    await flushRef.current();
  }, []);

  return {
    ydoc,
    awareness,
    socket,
    canEdit,
    activeUsers,
    connectionStatus,
    error,
    flushUpdates,
  };
};

export default useCollaborativeDocument;
