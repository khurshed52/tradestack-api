
import "dotenv/config";

import {
  generateEmbedding,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from "../modules/ai/rag/embedding.service.js";

async function main() {
  const text =
    "Customers must complete identity verification before their trading account can be approved.";

  const embedding = await generateEmbedding(text);

  console.log("Text:", text);
  console.log("Model:", EMBEDDING_MODEL);
  console.log("Expected dimensions:", EMBEDDING_DIMENSIONS);
  console.log("Actual dimensions:", embedding.length);
  console.log("First 10 values:", embedding.slice(0, 10));
}

main().catch((error) => {
  console.error("Embedding test failed:", error);
  process.exitCode = 1;
});
