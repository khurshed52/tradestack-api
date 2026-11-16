
import "dotenv/config";
import { readFile } from "node:fs/promises";

import { ingestKnowledgeDocument } from
  "../modules/ai/rag/ingestion.service.js";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "RAG_SMOKE_TEST_REQUIRES_DEVELOPMENT"
    );
  }

  const content = await readFile(
    "knowledge/tradepro/rag-smoke-test.txt",
    "utf8"
  );

  const result = await ingestKnowledgeDocument({
    title: "TradePro AI RAG Integration Test",
    slug: "tradepro-rag-integration-test",
    category: "TEST",
    version: 1,
    content,
  });

  console.log("RAG test ingestion completed:");
  console.dir(result, { depth: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
