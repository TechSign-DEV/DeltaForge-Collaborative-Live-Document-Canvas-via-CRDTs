
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

let pubClient = null;
let subClient = null;

export const connectRedis = async (io) => {
  // Avoid creating duplicate Redis connections.
  if (pubClient?.isReady && subClient?.isReady) {
    return;
  }

  try {
    pubClient = createClient({
      url: process.env.REDIS_URL,
    });

    subClient = pubClient.duplicate();

    pubClient.on("error", (error) => {
      console.error("Redis Publisher Error:", error.message);
    });

    subClient.on("error", (error) => {
      console.error("Redis Subscriber Error:", error.message);
    });

    // Wait for both connections to finish before configuring the adapter.
    const results = await Promise.allSettled([
      pubClient.connect(),
      subClient.connect(),
    ]);

    const failedConnection = results.find(
      (result) => result.status === "rejected"
    );

    if (failedConnection) {
      throw failedConnection.reason;
    }

    io.adapter(createAdapter(pubClient, subClient));

    console.log("Redis adapter configured successfully");
  } catch (error) {
    console.error("Redis connection failed:", error.message);

    await closeRedis();

    throw error;
  }
};

// Close Redis connections during application shutdown.
export const closeRedis = async () => {
  const clients = [pubClient, subClient];

  await Promise.allSettled(
    clients.map(async (client) => {
      if (client?.isOpen) {
        await client.quit();
      }
    })
  );

  pubClient = null;
  subClient = null;

  console.log("Redis connections closed");
};

export { pubClient, subClient };
