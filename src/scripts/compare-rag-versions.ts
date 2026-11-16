
import "dotenv/config";

import prisma from "../db/db.config.js";
import {
  EMBEDDING_MODEL,
  generateEmbedding,
} from "../modules/ai/rag/embedding.service.js";

type ComparisonRow = {
  version: number;
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
  similarity: number;
  rank: bigint;
};

const questions = [
  "How do I complete KYC verification?",
  "I'm stuck on the identity verification QR code.",
  "Why is my withdrawal pending?",
  "What deposit methods are available?",
  "How do transfers between trading accounts work?",
];

async function main() {
  for (const question of questions) {
    const embedding = await generateEmbedding(question);
    const vector = `[${embedding.join(",")}]`;

    // Evaluation-only query.
    // Search the two specific internal training versions.
    const results = await prisma.$queryRaw<ComparisonRow[]>`
      WITH ranked AS (
        SELECT
          d."version",
          c."pageNumber",
          c."chunkIndex",
          c."content",
          (
            1 - (
              c."embedding" <=> ${vector}::vector(768)
            )
          )::double precision AS similarity,
          ROW_NUMBER() OVER (
            PARTITION BY d."version"
            ORDER BY
              c."embedding" <=> ${vector}::vector(768),
              c."id"
          ) AS rank
        FROM "KnowledgeChunk" c
        JOIN "KnowledgeDocument" d
          ON d."id" = c."documentId"
        WHERE d."slug" = 'tradepro-ai-sample-knowledge-base'
          AND d."version" IN (1, 2)
          AND d."status" = 'DRAFT'::"KnowledgeDocumentStatus"
          AND d."visibility" = 'INTERNAL'::"KnowledgeVisibility"
          AND c."embedding" IS NOT NULL
          AND c."embeddingModel" = ${EMBEDDING_MODEL}
      )
      SELECT *
      FROM ranked
      WHERE rank <= 3
      ORDER BY "version", rank
    `;

    console.log("\n==================================");
    console.log("QUESTION:", question);

    for (const version of [1, 2]) {
      console.log(`\n--- VERSION ${version} ---`);

      const matches = results.filter(
        (r) => r.version === version,
      );

      if (!matches.length) {
        console.log("No matches");
        continue;
      }

      for (const match of matches) {
        console.log({
          rank: Number(match.rank),
          page: match.pageNumber,
          similarity: match.similarity.toFixed(4),
          preview: match.content.slice(0, 180),
        });
      }
    }
  }
}

main()
  .catch((error) => {
    console.error("RAG comparison failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
