
import {
  getUnsummarizedMessages,
  saveAiConversationSummary,
} from "./ai-conversation.service.js";

import { summarizeAiConversation } from "./ai.service.js";

export async function updateAiConversationSummary(
  userId: string,
  conversationId: string
) {
  // 1. Read existing summary and new messages.
  const {
    previousSummary,
    checkpointId,
    messages,
    lastMessageId,
  } = await getUnsummarizedMessages(
    userId,
    conversationId
  );

  // 2. Nothing new to summarize.
  if (!lastMessageId || messages.length === 0) {
    return {
      updated: false,
      summarizedMessages: 0,
    };
  }

  // 3. Merge old summary with new messages using Gemini.
  const updatedSummary = await summarizeAiConversation(
    messages,
    previousSummary
  );

  // 4. Save only if another request hasn't
  //    advanced the checkpoint.
  await saveAiConversationSummary(
    userId,
    conversationId,
    updatedSummary,
    lastMessageId,
    checkpointId
  );

  return {
    updated: true,
    summarizedMessages: messages.length,
  };
}
