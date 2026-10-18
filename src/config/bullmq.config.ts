
import "dotenv/config";

export const getEmailRedisConnection = (
  worker = false
) => {
  const redisUrl = process.env.BULLMQ_REDIS_URL;

  if (!redisUrl) {
    throw new Error("BULLMQ_REDIS_URL is required");
  }

  const url = new URL(redisUrl);

  if (
    url.protocol !== "redis:" &&
    url.protocol !== "rediss:"
  ) {
    throw new Error(
      "BULLMQ_REDIS_URL must use redis:// or rediss://"
    );
  }

  const isProduction = process.env.NODE_ENV === "production";

  // Preserve the local Docker Redis safety restriction.
  if (
    !isProduction &&
    (
      url.protocol !== "redis:" ||
      url.hostname !== "127.0.0.1" ||
      (url.port && url.port !== "6379") ||
      url.username ||
      url.password
    )
  ) {
    throw new Error(
      "Local BullMQ requires Docker Redis at 127.0.0.1:6379"
    );
  }

  if (
    isProduction &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error(
      "Production BullMQ cannot use localhost Redis"
    );
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username
      ? decodeURIComponent(url.username)
      : undefined,
    password: url.password
      ? decodeURIComponent(url.password)
      : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: worker ? null : 1,
  };
};
