import { createClient } from "redis";

const redisUrl =
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redisClient = createClient({
  url: redisUrl,
  socket: {
    connectTimeout: 5000,
   reconnectStrategy: (retries) => {
  return Math.min((retries + 1) * 200, 5000);
},
  },
});

redisClient.on("error", (error) => {
  console.error("Redis client error:", error.message);
});

redisClient.on("ready", () => {
  console.log("Redis client ready");
});

export const connectRedis = async (): Promise<void> => {
  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
  } catch (error) {
    console.error(
      "Redis connection failed:",
      error instanceof Error ? error.message : error
    );
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient.isOpen) {
    await redisClient.close();
  }
};