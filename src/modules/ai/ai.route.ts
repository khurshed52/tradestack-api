import { Router } from "express";
import { z } from "zod";

import { validateBody } from "../../middleware/validate.js";
import { aiChatController, aiChatStreamController, createAiConversationController, aiChatPersistentController, testAiSummaryController, 
    listAiConversationsController , getAiConversationMessagesController, testAiToolExecutionController, testAiToolResponseController,
    testAiToolSelectionController
} 
    from "./ai.controller.js";
import rateLimit from "express-rate-limit";

const router = Router();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
}).strict();

const persistentChatSchema = chatSchema.extend({
  conversationId: z.string().uuid().optional(),
});


const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:
    process.env.NODE_ENV === "production"
      ? 60
      : 200,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    statusCode: 429,
    message:
      "You've reached the AI message limit. Please try again shortly.",
    data: null,
  },
});

router.post(
  "/chat",
  aiRateLimiter,
  validateBody(chatSchema),
  aiChatController
);

router.post(
  "/chat/stream",
  aiRateLimiter,
  validateBody(chatSchema),
  aiChatStreamController
);

router.post(
  "/conversations",
  aiRateLimiter,
  validateBody(chatSchema),
  createAiConversationController
);

router.post(
  "/chat/persistent",
  aiRateLimiter,
   validateBody(persistentChatSchema),
  aiChatPersistentController
);

router.post(
  "/conversations/:conversationId/summarize",
  aiRateLimiter,
  testAiSummaryController
);

router.get(
  "/conversations",
  aiRateLimiter,
  listAiConversationsController
);


router.get(
  "/conversations/:conversationId/messages",
  aiRateLimiter,
  getAiConversationMessagesController
);


router.post(
  "/tools/test-selection",
  aiRateLimiter,
  validateBody(chatSchema),
  testAiToolSelectionController
);

router.post(
  "/tools/test-execution",
  aiRateLimiter,
  validateBody(chatSchema),
  testAiToolExecutionController
);

router.post(
  "/tools/test-response",
  aiRateLimiter,
  validateBody(chatSchema),
  testAiToolResponseController
);

export default router;