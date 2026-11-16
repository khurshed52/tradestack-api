
import "dotenv/config";

import prisma from "../db/db.config.js";
import { searchKnowledge } from "../modules/ai/rag/retrieval.service.js";

async function main() {
  const questions = [
    "I'm stuck with identity verification. What should I do?",
    "How can I complete KYC verification?",
    "How do I withdraw money from my trading account?",
  ];

  for (const question of questions) {
    const results = await searchKnowledge({
      question,
      limit: 3,
    });

    console.log("\nQuestion:", question);
    console.log("Results:", results.length);

    for (const result of results) {
      console.log({
        title: result.title,
        category: result.category,
        similarity: result.similarity.toFixed(4),
        sourceUrl: result.sourceUrl,
        content: result.content.slice(0, 180),
      });
    }
  }
}

main()
  .catch((error) => {
    console.error("RAG retrieval test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
