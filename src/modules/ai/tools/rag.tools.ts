
import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";

import { searchKnowledge } from "../rag/retrieval.service.js";

// --------------------------------
// ARGUMENT VALIDATION
// --------------------------------

export const platformKnowledgeArgsSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3)
    .max(1000),
}).strict();

// --------------------------------
// GEMINI TOOL DECLARATION
// --------------------------------

export const ragTools: FunctionDeclaration[] = [
  {
    name: "search_platform_knowledge",

    description:
      "Search approved TradePro platform documentation " +
      "for KYC procedures, identity verification guidance, " +
      "deposits, withdrawals, transfers, account management, " +
      "and support policies. " +
      "Use this tool for questions about TradePro procedures " +
      "or documented policies. " +
      "Do not use it to retrieve live customer balances, " +
      "transaction statuses, or current market prices. " +
      "Only approved, published, public knowledge is searched.",

    parametersJsonSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "A focused question about TradePro documentation. " +
            "Preserve the customer's original intent.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
];

// --------------------------------
// TOOL EXECUTION
// --------------------------------

export async function executePlatformKnowledge(
  args: z.output<typeof platformKnowledgeArgsSchema>,
  signal?: AbortSignal,
) {
  const results = await searchKnowledge({
    question: args.question,
    limit: 10,
  }, signal);

  if (results.length === 0) {
    return {
      status: "NO_APPROVED_KNOWLEDGE",
      question: args.question,
      resultCount: 0,
      message:
        "No approved TradePro documentation was retrieved. " +
        "Do not invent an answer or infer policies from " +
        "unrelated information.",
      sources: [],
    };
  }

  return {
    status: "KNOWLEDGE_FOUND",
    question: args.question,
    resultCount: results.length,

    sources: results.map((result, index) => ({
      sourceId: `S${index + 1}`,
      documentId: result.documentId,
      chunkId: result.chunkId,
      title: result.title,
      category: result.category,
      version: result.version,
      pageNumber: result.pageNumber,
      sectionTitle: result.sectionTitle,
      sourceUrl: result.sourceUrl,
      similarity: result.similarity,
      content: result.content,
    })),
  };
}
