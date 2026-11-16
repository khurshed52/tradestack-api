
import "dotenv/config";

import prisma from "../db/db.config.js";
import { publishKnowledgeDocument } from
  "../modules/ai/rag/knowledge-publication.service.js";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("DEVELOPMENT_ONLY");
  }

  const adminUserId = process.env.RAG_TEST_ADMIN_USER_ID;

  if (!adminUserId) {
    throw new Error("RAG_TEST_ADMIN_USER_ID_REQUIRED");
  }

  const document = await prisma.knowledgeDocument.findFirst({
    where: {
      slug: "tradepro-kyc-verification-guide",
      version: 1,
      status: "DRAFT",
      visibility: "INTERNAL",
    },
  });

  if (!document) {
    throw new Error("KYC_TEST_DOCUMENT_NOT_FOUND");
  }

  const result = await publishKnowledgeDocument({
    documentId: document.id,
    adminUserId,
  });

  console.log("KYC GUIDE PUBLISHED:", result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
