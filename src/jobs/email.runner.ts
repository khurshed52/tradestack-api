import "dotenv/config";

import prisma from "../db/db.config.js";
import { emailQueue } from "./queues/email.queue.js";
import { emailWorker } from "./workers/email.worker.js";
import { dispatchPendingEmailEvents } from "./services/emailOutbox.dispatcher.js";

const DISPATCH_INTERVAL_MS = 10_000;

let stopping = false;
let activeDispatch: Promise<void> | undefined;
let shutdownPromise: Promise<void> | undefined;

const dispatch = (): void => {
  if (stopping || activeDispatch) return;

  activeDispatch = dispatchPendingEmailEvents()
    .catch((error) => {
      console.error("[Email Runner] Dispatch failed:", error);
    })
    .finally(() => {
      activeDispatch = undefined;
    });
};

const shutdown = (): Promise<void> => {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  clearInterval(timer);

  shutdownPromise = (async () => {
    // Finish enqueueing and active delivery before closing their dependencies.
    await activeDispatch;
    try {
      await emailWorker.close();
    } finally {
      const results = await Promise.allSettled([
        emailQueue.close(),
        prisma.$disconnect(),
      ]);
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("Email runner resource cleanup failed");
      }
    }
  })();
  return shutdownPromise;
};

const requestShutdown = (): void => {
  void shutdown().catch(() => {
    console.error("[Email Runner] Shutdown failed");
    process.exitCode = 1;
  });
};

console.log("[Email Runner] Starting...");

// Dispatch existing pending events and continue polling without overlap.
dispatch();
const timer = setInterval(dispatch, DISPATCH_INTERVAL_MS);

// This is the sole worker startup; Worker has autorun disabled.
void emailWorker.run().catch((error) => {
  console.error("[Email Runner] Worker stopped unexpectedly:", error);
  process.exitCode = 1;
  requestShutdown();
});

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
