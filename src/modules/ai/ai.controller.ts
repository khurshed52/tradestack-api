
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  generateAiResponse,
  streamAiResponse,
} from "./ai.service.js";

import {
  createAiConversation,
  saveAiAssistantMessage,
  saveAiUserMessage,
  getAiConversationContext,
  listAiConversations,
  getAiConversationMessages,
} from "./ai-conversation.service.js";

import {
  updateAiConversationSummary,
} from "./ai-summary.service.js";

import {
  selectAiTool,
  selectAndExecuteAiTool,
  generateAiResponseWithTools,
  streamAiResponseWithTools,
} from "./ai-tool-selection.service.js";

// --------------------------------
// NORMAL AI CHAT
// --------------------------------

export const aiChatController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await generateAiResponse(
      req.body.message,
    );

    return res.status(200).json({
      statusCode: 200,
      message: "AI response generated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------
// BASIC AI STREAMING
// WITHOUT PERSISTENT MEMORY / RAG
// --------------------------------

export const aiChatStreamController = async (
  req: Request,
  res: Response,
) => {
  const controller = new AbortController();

  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };

  res.on("close", onClose);

  res.setHeader(
    "Content-Type",
    "text/event-stream; charset=utf-8",
  );

  res.setHeader(
    "Cache-Control",
    "no-cache, no-transform",
  );

  res.setHeader(
    "Connection",
    "keep-alive",
  );

  res.setHeader(
    "X-Accel-Buffering",
    "no",
  );

  res.flushHeaders();

  const sendEvent = (
    event: string,
    data: unknown,
  ) => {
    if (res.destroyed || res.writableEnded) {
      return;
    }

    res.write(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    );

    (
      res as Response & {
        flush?: () => void;
      }
    ).flush?.();
  };

  try {
    for await (const text of streamAiResponse(
      req.body.message,
      controller.signal,
    )) {
      if (controller.signal.aborted) {
        break;
      }

      sendEvent("chunk", { text });
    }

    if (!controller.signal.aborted) {
      sendEvent("done", {
        finished: true,
      });

      res.end();
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error("BASIC_AI_STREAM_FAILED", error);

      sendEvent("error", {
        message: "AI streaming failed",
      });

      res.end();
    }
  } finally {
    res.off("close", onClose);
  }
};

// --------------------------------
// CREATE AI CONVERSATION
// --------------------------------

export const createAiConversationController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const conversation = await createAiConversation(
      req.user!.id,
      req.body.message,
    );

    return res.status(201).json({
      statusCode: 201,
      message: "AI conversation created",
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------
// PERSISTENT AI CHAT
//
// SAME ENDPOINT:
// POST /api/ai/chat/persistent
//
// Accept: application/json
//   -> Normal JSON response
//
// Accept: text/event-stream
//   -> SSE streaming response
//
// BOTH SUPPORT:
// - Authentication
// - Conversation history
// - RAG
// - Function calling
// - Database persistence
// - Source citations
// --------------------------------

export const aiChatPersistentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Require explicit SSE opt-in.
  // Generic Accept: */* continues returning JSON.
  const wantsStreaming = (
    req.get("accept") ?? ""
  )
    .split(",")
    .some((entry) => {
      const mediaType = entry
        .trim()
        .split(";")[0]
        ?.trim()
        .toLowerCase();

      return mediaType === "text/event-stream";
    });

  const abortController = new AbortController();

  const onClose = () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  };

  if (wantsStreaming) {
    res.on("close", onClose);
  }

  // --------------------------------
  // SSE EVENT WRITER
  // --------------------------------

  const sendEvent = (
    event: string,
    data: unknown,
  ) => {
    if (
      abortController.signal.aborted ||
      res.destroyed ||
      res.writableEnded
    ) {
      return;
    }

    res.write(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    );

    // Flush events when compression middleware
    // supports explicit flushing.
    (
      res as Response & {
        flush?: () => void;
      }
    ).flush?.();
  };

  try {
    const userId = req.user!.id;

    const {
      message,
      conversationId,
    } = req.body as {
      message: string;
      conversationId?: string;
    };

    let activeConversationId: string;

    let history: Awaited<
      ReturnType<typeof getAiConversationContext>
    >["history"] = [];

    let summary: string | null = null;

    // --------------------------------
    // EXISTING CONVERSATION
    // --------------------------------

    if (conversationId) {
      // Verify ownership before saving message.
      const context =
        await getAiConversationContext(
          userId,
          conversationId,
        );

      activeConversationId = conversationId;

      history = context.history;
      summary = context.summary;

      if (abortController.signal.aborted) {
        return;
      }

      await saveAiUserMessage(
        activeConversationId,
        message,
      );
    } else {
      // --------------------------------
      // NEW CONVERSATION
      // --------------------------------

      if (abortController.signal.aborted) {
        return;
      }

      const conversation =
        await createAiConversation(
          userId,
          message,
        );

      activeConversationId = conversation.id;

      // createAiConversation already saves
      // the initial user message.
    }

    // --------------------------------
    // NORMAL JSON RESPONSE
    // --------------------------------

    if (!wantsStreaming) {
      const result =
        await generateAiResponseWithTools(
          message,
          history,
          summary,
          userId,
        );

      await saveAiAssistantMessage(
        activeConversationId,
        result.reply,
        result.usage,
        result.sources,
        result.marketQuote,
        result.answerSources ?? [],
      );

      return res.status(200).json({
        statusCode: 200,
        message: "AI response generated and saved",
        data: {
          conversationId: activeConversationId,
          ...result,
        },
      });
    }

    // --------------------------------
    // STREAMING SSE RESPONSE
    // --------------------------------

    if (abortController.signal.aborted) {
      return;
    }

    res.status(200);

    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8",
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform",
    );

    res.setHeader(
      "Connection",
      "keep-alive",
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no",
    );

    res.flushHeaders();

    // --------------------------------
    // SEND CONVERSATION INFORMATION
    // --------------------------------

    sendEvent("conversation", {
      conversationId: activeConversationId,
    });

    sendEvent("status", {
      stage: "generating",
    });

    // --------------------------------
    // STREAM GEMINI ANSWER
    // WITH RAG + AUTHENTICATED TOOLS
    // --------------------------------

    const result =
      await streamAiResponseWithTools(
        message,
        history,
        summary,
        userId,

        // Called for each generated answer delta.
        (text: string) => {
          sendEvent("chunk", { text });
        },

        abortController.signal,
      );

    if (abortController.signal.aborted) {
      return;
    }

    // --------------------------------
    // SAVE COMPLETED ASSISTANT RESPONSE
    // --------------------------------

    await saveAiAssistantMessage(
      activeConversationId,
      result.reply,
      result.usage,
      result.sources,
      result.marketQuote,
      result.answerSources ?? [],
    );

    // --------------------------------
    // SEND FINAL METADATA + CITATIONS
    // --------------------------------

    sendEvent("done", {
      finished: true,
      data: {
        conversationId: activeConversationId,
        ...result,
      },
    });

    res.end();
  } catch (error) {
    if (abortController.signal.aborted) {
      return;
    }

    // --------------------------------
    // ERRORS BEFORE RESPONSE STARTS
    // --------------------------------

    if (!res.headersSent) {
      if (
        error instanceof Error &&
        error.message ===
          "AI_CONVERSATION_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message: "Conversation not found",
        });
      }

      return next(error);
    }

    // --------------------------------
    // ERRORS AFTER STREAM STARTS
    // --------------------------------

    console.error(
      "PERSISTENT_AI_STREAM_FAILED",
      error,
    );

    sendEvent("error", {
      code: "AI_STREAM_FAILED",
      message:
        "The response could not be completed. Please try again.",
    });

    res.end();
  } finally {
    if (wantsStreaming) {
      res.off("close", onClose);
    }
  }
};

// --------------------------------
// TEST AI SUMMARIZATION
// --------------------------------

export const testAiSummaryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.id;

    const conversationId =
      req.params.conversationId as string;

    const result =
      await updateAiConversationSummary(
        userId,
        conversationId,
      );

    return res.status(200).json({
      statusCode: 200,
      message: "Conversation summary processed",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------
// LIST AI CONVERSATIONS
// --------------------------------

export const listAiConversationsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const conversations =
      await listAiConversations(
        req.user!.id,
      );

    return res.status(200).json({
      statusCode: 200,
      message:
        "AI conversations retrieved successfully",
      data: {
        items: conversations,
      },
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------
// GET CONVERSATION MESSAGES
// --------------------------------

export const getAiConversationMessagesController =
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const conversationId =
        req.params.conversationId as string;

      const result =
        await getAiConversationMessages(
          req.user!.id,
          conversationId,
        );

      return res.status(200).json({
        statusCode: 200,
        message:
          "AI conversation messages retrieved successfully",
        data: result,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "AI_CONVERSATION_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message: "Conversation not found",
        });
      }

      next(error);
    }
  };

// --------------------------------
// TEST TOOL SELECTION
// --------------------------------

export const testAiToolSelectionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await selectAiTool(
      req.body.message,
    );

    return res.status(200).json({
      statusCode: 200,
      message: "AI tool selection completed",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------
// TEST TOOL EXECUTION
// --------------------------------

export const testAiToolExecutionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result =
      await selectAndExecuteAiTool(
        req.body.message,
      );

    return res.status(200).json({
      statusCode: 200,
      message: "AI tool execution completed",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------------
// TEST COMPLETE TOOL RESPONSE
// --------------------------------

export const testAiToolResponseController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result =
      await generateAiResponseWithTools(
        req.body.message,
      );

    return res.status(200).json({
      statusCode: 200,
      message: "AI tool response generated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
