
import "dotenv/config";

import prisma from "../db/db.config.js";

async function main() {
  const document = await prisma.knowledgeDocument.findFirst({
    where: {
      slug: "tradepro-ai-sample-knowledge-base",
      version: 2,
    },
    select: {
      title: true,
      version: true,
      status: true,
      visibility: true,
    },
  });

  console.log("Training document:", document);

  if (!document) {
    throw new Error("TRAINING_DOCUMENT_NOT_FOUND");
  }

  if (
    document.status !== "DRAFT" ||
    document.visibility !== "INTERNAL"
  ) {
    throw new Error("UNSAFE_TRAINING_DOCUMENT_STATE");
  }

  console.log(
    "PASS: Training document remains DRAFT and INTERNAL.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
