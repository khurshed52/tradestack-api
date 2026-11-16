
import "dotenv/config";

import prisma from "../db/db.config.js";
import { generateEmbedding } from "../modules/ai/rag/embedding.service.js";

type SearchResult = {
  chunkId: string;
  chunkIndex: number;
  title: string;
  content: string;
  similarity: number;
};

async function main() {
  const question =
    "I'm stuck with identity verification. How can I continue?";

  // Convert the customer question into a vector.
  const embedding = await generateEmbedding(question);

  // pgvector accepts a string representation of the vector.
  const vectorValue = `[${embedding.join(",")}]`;

  // Learning-only search against our specific draft document.
  // Do not reuse this unrestricted query in customer-facing APIs.
  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      c."id" AS "chunkId",
      c."chunkIndex",
      d."title",
      c."content",
      (
        1 - (
          c."embedding" <=> ${vectorValue}::vector(768)
        )
      )::double precision AS similarity
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d
      ON d."id" = c."documentId"
    WHERE d."slug" = 'tradepro-kyc-verification-guide'
      AND c."embedding" IS NOT NULL
      AND c."embeddingModel" = 'gemini-embedding-2'
    ORDER BY
      c."embedding" <=> ${vectorValue}::vector(768)
    LIMIT 3
  `;

  console.log("Customer question:", question);
  console.log("Matching chunks:", results.length);

  for (const result of results) {
    console.log("\nDocument:", result.title);
    console.log("Chunk:", result.chunkIndex);
    console.log("Similarity:", result.similarity.toFixed(4));
    console.log("Content:\n", result.content);
  }
}

main()
  .catch((error) => {
    console.error("Vector search failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
