
import { getGeminiClient } from "../../../config/gemini.js";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

export async function generateEmbedding(
  text: string,
  signal?: AbortSignal,
): Promise<number[]> {
  signal?.throwIfAborted();
  const content = text.trim();

  if (!content) {
    throw new Error("EMBEDDING_TEXT_REQUIRED");
  }

  const ai = getGeminiClient();

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: content,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      ...(signal ? { abortSignal: signal } : {}),
    },
  });

  const values = response.embeddings?.[0]?.values;

  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("INVALID_EMBEDDING_DIMENSIONS");
  }

  if (!values.every(Number.isFinite)) {
    throw new Error("INVALID_EMBEDDING_VALUES");
  }

  return values;
}
