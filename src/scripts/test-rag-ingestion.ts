
import "dotenv/config";

import prisma from "../db/db.config.js";
import { ingestKnowledgeDocument } from "../modules/ai/rag/ingestion.service.js";

async function main() {
  const result = await ingestKnowledgeDocument({
    title: "TradePro KYC Verification Guide",
    slug: "tradepro-kyc-verification-guide",
    category: "KYC",
    version: 1,

    content: `
KYC Verification Overview

Customers must complete their KYC profile before
proceeding to identity verification.

Identity Verification

The verification interface may ask customers to
continue using a smartphone and a valid identity
document.

Verification Troubleshooting

If identity verification cannot be completed,
customers should follow the instructions displayed
by the verification provider or contact TradePro
support.

Verification Status

A verification session being in progress does not
mean the customer's KYC application is approved.
    `,
  });

  console.log("Ingestion result:", result);

  const savedDocument =
    await prisma.knowledgeDocument.findUnique({
      where: {
        id: result.documentId,
      },
      include: {
        chunks: {
          select: {
            id: true,
            chunkIndex: true,
            content: true,
            embeddingModel: true,
          },
          orderBy: {
            chunkIndex: "asc",
          },
        },
      },
    });

  console.log("Saved document:", savedDocument);
}

main()
  .catch((error) => {
    console.error("RAG ingestion failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
