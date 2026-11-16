import prisma from "../../db/db.config.js";

// --------------------------------
// CREATE CONVERSATION
// --------------------------------

export async function createAiConversation(
  userId: string,
  message: string
) {
  return prisma.aiConversation.create({
    data: {
      userId,
      title: message.slice(0, 80),
      messages: {
        create: {
          role: "USER",
          content: message,
        },
      },
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });
}

// --------------------------------
// SAVE USER MESSAGE
// --------------------------------

export async function saveAiUserMessage(
  conversationId: string,
  message: string
) {
  return prisma.aiMessage.create({
    data: {
      conversationId,
      role: "USER",
      content: message,
    },
  });
}

// --------------------------------
// SAVE ASSISTANT MESSAGE
// --------------------------------

export type AiNewsSource = {
  title: string;
  publisher: string | null;
  url: string;
  publishedAt: string;
};

export type AiMarketQuote = {
  symbol: string;
  price: number;
  currency: string | null;
  changePercent: string | number | null;
  timestamp: string | null;
  source: string;
};

// These objects are produced by the AI service after source validation.
// Keep the persistence layer independent of specific tools or document types.
export type AiAnswerSource = unknown;

export async function saveAiAssistantMessage(
  conversationId: string,
  reply: string,
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  },
  sources: AiNewsSource[] = [],
  marketQuote: AiMarketQuote | null = null,
  answerSources: AiAnswerSource[] = []
) {
  return prisma.aiMessage.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: reply,

      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,

      model:
        process.env.GEMINI_MODEL ||
        "gemini-3.1-flash-lite",

      // Preserve the existing Marketaux/news source data.
      sources,

      marketQuote: marketQuote ?? undefined,

      // Persist answer attribution separately from market-news sources.
      // The Prisma schema must declare: answerSources Json?
      answerSources: JSON.parse(JSON.stringify(answerSources)),
    },
  });
}

// --------------------------------
// GET RECENT CONVERSATION HISTORY
// --------------------------------

export async function getAiConversationHistory(
  userId: string,
  conversationId: string
) {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: {
      id: true,
      messages: {
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: 20,
        select: {
          role: true,
          content: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }

  return conversation.messages.reverse();
}

// --------------------------------
// GET UNSUMMARIZED MESSAGES
// --------------------------------

export async function getUnsummarizedMessages(
  userId: string,
  conversationId: string
) {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: {
      summary: true,
      lastSummarizedMessageId: true,
    },
  });

  if (!conversation) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }

  let checkpoint: {
    id: string;
    createdAt: Date;
  } | null = null;

  if (conversation.lastSummarizedMessageId) {
    checkpoint = await prisma.aiMessage.findFirst({
      where: {
        id: conversation.lastSummarizedMessageId,
        conversationId,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (!checkpoint) {
      throw new Error("AI_SUMMARY_CHECKPOINT_NOT_FOUND");
    }
  }

  const messages = await prisma.aiMessage.findMany({
    where: {
      conversationId,
      ...(checkpoint
        ? {
            OR: [
              {
                createdAt: {
                  gt: checkpoint.createdAt,
                },
              },
              {
                createdAt: checkpoint.createdAt,
                id: {
                  gt: checkpoint.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: 20,
    select: {
      id: true,
      role: true,
      content: true,
    },
  });

  return {
    previousSummary: conversation.summary,
    checkpointId: conversation.lastSummarizedMessageId,
    messages,
    lastMessageId: messages.at(-1)?.id ?? null,
  };
}

// --------------------------------
// SAVE SUMMARY WITH CONCURRENCY CHECK
// --------------------------------

export async function saveAiConversationSummary(
  userId: string,
  conversationId: string,
  summary: string,
  lastMessageId: string,
  expectedCheckpoint: string | null
) {
  const result = await prisma.aiConversation.updateMany({
    where: {
      id: conversationId,
      userId,
      lastSummarizedMessageId: expectedCheckpoint,
    },
    data: {
      summary,
      lastSummarizedMessageId: lastMessageId,
      summaryUpdatedAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new Error("AI_SUMMARY_CHECKPOINT_CONFLICT");
  }
}

// --------------------------------
// GET CONVERSATION CONTEXT
// --------------------------------

export async function getAiConversationContext(
  userId: string,
  conversationId: string
) {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: {
      summary: true,
      lastSummarizedMessageId: true,
    },
  });

  if (!conversation) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }

  const checkpoint = conversation.lastSummarizedMessageId
    ? await prisma.aiMessage.findFirst({
        where: {
          id: conversation.lastSummarizedMessageId,
          conversationId,
        },
        select: {
          id: true,
          createdAt: true,
        },
      })
    : null;

  if (
    conversation.lastSummarizedMessageId &&
    !checkpoint
  ) {
    throw new Error("AI_SUMMARY_CHECKPOINT_NOT_FOUND");
  }

  const messages = await prisma.aiMessage.findMany({
    where: {
      conversationId,
      ...(checkpoint
        ? {
            OR: [
              {
                createdAt: {
                  gt: checkpoint.createdAt,
                },
              },
              {
                createdAt: checkpoint.createdAt,
                id: {
                  gt: checkpoint.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: 20,
    select: {
      role: true,
      content: true,
    },
  });

  return {
    summary: conversation.summary,
    history: messages.reverse(),
  };
}

// --------------------------------
// LIST CONVERSATIONS
// --------------------------------

export async function listAiConversations(
  userId: string,
  limit = 20
) {
  const conversations = await prisma.aiConversation.findMany({
    where: {
      userId,
    },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: limit,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: 1,
        select: {
          content: true,
        },
      },
    },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessagePreview:
      conversation.messages[0]?.content.slice(0, 120) ?? null,
  }));
}

// --------------------------------
// GET CONVERSATION MESSAGES
// --------------------------------

export async function getAiConversationMessages(
  userId: string,
  conversationId: string,
  limit = 50
) {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!conversation) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }

  const messages = await prisma.aiMessage.findMany({
    where: {
      conversationId,
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      sources: true,
      answerSources: true,
    },
  });

  return {
    conversation,
    messages: messages.reverse().map((message) => ({
      ...message,
      sources: Array.isArray(message.sources)
        ? message.sources
        : [],
      answerSources: Array.isArray(message.answerSources)
        ? message.answerSources
        : [],
    })),
    nextCursor: null,
  };
}
