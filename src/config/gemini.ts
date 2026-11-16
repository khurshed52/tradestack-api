import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export const getGeminiClient = (): GoogleGenAI => {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000 } });

  return client;
};