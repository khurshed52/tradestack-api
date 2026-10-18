
import { Queue } from "bullmq";
import { getEmailRedisConnection } from "../../config/bullmq.config.js";

export type EmailJobData = {
  userId: string;
  outboxEventId: string;
};

export const emailQueue = new Queue<EmailJobData>(
  "tradestack-emails",
  {
    connection: getEmailRedisConnection(),

    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);

emailQueue.on("error", (error) => {
  console.error("[Email Queue] Error:", error.message);
});
