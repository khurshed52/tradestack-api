
import "dotenv/config";

import prisma from "../db/db.config.js";
import { searchKnowledge } from
  "../modules/ai/rag/retrieval.service.js";

async function main() {
  const questions = [
    "How do I complete my KYC verification?",
    "What should I do if identity verification fails?",
    "How do transfers between accounts work?",
    "What is the withdrawal fee?",
  ];

  for (const question of questions) {
    console.log("\nQUESTION:", question);

    const results = await searchKnowledge({
      question,
      limit: 10,
    });

    console.table(
      results.map((result) => ({
        title: result.title,
        category: result.category,
        similarity: result.similarity.toFixed(4),
        page: result.pageNumber,
        chunk: result.chunkIndex,
      })),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
