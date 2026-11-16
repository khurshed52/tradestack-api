
import "dotenv/config";

import prisma from "../db/db.config.js";
import {
  searchTrainingKnowledge,
} from "../modules/ai/rag/retrieval.service.js";

const questions = [
  "How do I complete KYC verification?",
  "I'm stuck on the identity verification QR code.",
  "Why is my withdrawal pending?",
  "What deposit methods are available?",
  "How do transfers between trading accounts work?",
];

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Run with NODE_ENV=development only",
    );
  }

  for (const question of questions) {
    const results = await searchTrainingKnowledge({
      question,
      limit: 3,
    });

    console.log("\n================================");
    console.log("QUESTION:", question);
    console.log("RESULTS:", results.length);

    for (const [index, result] of results.entries()) {
      console.log(`\nMatch ${index + 1}`);
      console.log("Document:", result.title);
      console.log("PDF page:", result.pageNumber);
      console.log("Chunk:", result.chunkIndex);
      console.log(
        "Similarity:",
        result.similarity.toFixed(4),
      );
      console.log(
        "Passage:",
        result.content.slice(0, 350),
      );
    }
  }
}

main()
  .catch((error) => {
    console.error("PDF retrieval failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
