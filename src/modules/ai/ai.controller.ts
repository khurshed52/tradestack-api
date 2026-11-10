
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
} from "./ai-tool-selection.service.js";

// --------------------------------
// NORMAL AI CHAT
// --------------------------------

export const aiChatController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await generateAiResponse(
      req.body.message
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
// AI STREAMING
// --------------------------------

export const aiChatStreamController = async (
  req: Request,
  res: Response
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
    "text/event-stream"
  );

  res.setHeader(
    "Cache-Control",
    "no-cache, no-transform"
  );

  res.setHeader(
    "X-Accel-Buffering",
    "no"
  );

  res.flushHeaders();

  const sendEvent = (
    event: string,
    data: unknown
  ) => {
    if (res.destroyed || res.writableEnded) {
      return;
    }

    res.write(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    );
  };

  try {
    for await (const text of streamAiResponse(
      req.body.message,
      controller.signal
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
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { message } = req.body;

    const conversation = await createAiConversation(
      userId,
      message
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
// WITH MEMORY + FUNCTION CALLING
// --------------------------------


export const aiChatPersistentController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const {
      message,
      conversationId,
    } = req.body;

    let activeConversationId: string;

    let history: Awaited<
      ReturnType<typeof getAiConversationContext>
    >["history"] = [];

    let summary: string | null = null;

    // --------------------------------
    // EXISTING CONVERSATION
    // --------------------------------

    if (conversationId) {
      // Verify ownership and load conversation memory.
      const context =
        await getAiConversationContext(
          userId,
          conversationId
        );

      activeConversationId = conversationId;

      history = context.history;
      summary = context.summary;

      // Save the new user message only after
      // loading history to prevent duplication.
      await saveAiUserMessage(
        activeConversationId,
        message
      );
    } else {
      // --------------------------------
      // NEW CONVERSATION
      // --------------------------------

      const conversation =
        await createAiConversation(
          userId,
          message
        );

      activeConversationId = conversation.id;

      // createAiConversation() already stores
      // the initial user message.
    }

    // --------------------------------
    // GENERATE AI RESPONSE
    // WITH MEMORY + FUNCTION CALLING
    // --------------------------------

  const result =
    await generateAiResponseWithTools(
      message,
      history,
      summary,
      userId
    );

    // --------------------------------
    // SAVE ASSISTANT RESPONSE
    // INCLUDING NEWS + PRICE METADATA
    // --------------------------------

    await saveAiAssistantMessage(
      activeConversationId,
      result.reply,
      result.usage,
      result.sources,
      result.marketQuote
    );

    // --------------------------------
    // RETURN FRONTEND-COMPATIBLE RESULT
    // --------------------------------

    return res.status(200).json({
      statusCode: 200,
      message: "AI response generated and saved",
      data: {
        conversationId: activeConversationId,
        ...result,
      },
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
// TEST AI SUMMARIZATION
// --------------------------------

export const testAiSummaryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const { conversationId } = req.params;

    const result =
      await updateAiConversationSummary(
        userId,
        conversationId as string
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
  next: NextFunction
) => {
  try {
    const conversations =
      await listAiConversations(
        req.user!.id
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
    next: NextFunction
  ) => {
    try {
      const conversationId =
        req.params.conversationId as string;

      const result =
        await getAiConversationMessages(
          req.user!.id,
          conversationId
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
  next: NextFunction
) => {
  try {
    const result = await selectAiTool(
      req.body.message
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
  next: NextFunction
) => {
  try {
    const result =
      await selectAndExecuteAiTool(
        req.body.message
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
  next: NextFunction
) => {
  try {
    const result =
      await generateAiResponseWithTools(
        req.body.message
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
