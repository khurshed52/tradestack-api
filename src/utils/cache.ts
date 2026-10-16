import { redisClient } from "../config/redis.js";

export const cacheGet = async (
  key: string
): Promise<string | null> => {
  if (!redisClient.isReady) {
    return null;
  }

  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error("Redis cache GET failed:", error);
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> => {
  if (!redisClient.isReady) {
    return;
  }

  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    throw new Error("Invalid cache TTL");
  }

  try {
    await redisClient.set(key, value, {
      EX: ttlSeconds,
    });
  } catch (error) {
    console.error("Redis cache SET failed:", error);
  }
};

export const cacheDelete = async (
  key: string
): Promise<void> => {
  if (!redisClient.isReady) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    console.error("Redis cache DELETE failed:", error);
  }
};