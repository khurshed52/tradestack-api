
import "dotenv/config";

import prisma from "../db/db.config.js";

import { publishKnowledgeDocument } from
  "../modules/ai/rag/knowledge-publication.service.js";

// --------------------------------
// TEST DOCUMENT
// --------------------------------

const DOCUMENT_ID =
  "5722ad4d-6a08-4d73-bd5f-b09c0ab66364";

const EXPECTED_SLUG =
  "tradepro-rag-integration-test";

// --------------------------------
// MAIN
// --------------------------------

async function main() {
  // Only run in development.
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "RAG_SMOKE_TEST_REQUIRES_DEVELOPMENT"
    );
  }

  // IMPORTANT:
  // NODE_ENV=development does not guarantee
  // that DATABASE_URL points to a test database.
  //
  // Verify your .env DATABASE_URL manually
  // before running this script.

  const adminUserId =
    process.env.RAG_TEST_ADMIN_USER_ID;

  if (!adminUserId) {
    throw new Error(
      "RAG_TEST_ADMIN_USER_ID_REQUIRED"
    );
  }

  // Fetch document before publishing.
  const document =
    await prisma.knowledgeDocument.findUnique({
      where: {
        id: DOCUMENT_ID,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        status: true,
        visibility: true,
        version: true,
      },
    });

  if (!document) {
    throw new Error(
      "RAG_TEST_DOCUMENT_NOT_FOUND"
    );
  }

  // Ensure this is the intended smoke-test document.
  if (
    document.slug !== EXPECTED_SLUG ||
    document.category !== "TEST"
  ) {
    throw new Error(
      "UNEXPECTED_RAG_TEST_DOCUMENT"
    );
  }

  console.log("Document before publishing:");
  console.dir(document, { depth: 5 });

  if (
    document.status === "PUBLISHED" &&
    document.visibility === "PUBLIC"
  ) {
    console.log(
      "Document is already published. No changes needed."
    );
    return;
  }

  if (document.status !== "DRAFT") {
    throw new Error(
      "RAG_TEST_DOCUMENT_MUST_BE_DRAFT"
    );
  }

  // Validate admin permissions and publish
  // through the existing service.
  const result = await publishKnowledgeDocument({
    documentId: DOCUMENT_ID,
    adminUserId,
  });

  console.log("Publication service result:");
  console.dir(result, { depth: 5 });

  // Verify the final database state.
  const publishedDocument =
    await prisma.knowledgeDocument.findUnique({
      where: {
        id: DOCUMENT_ID,
      },
      select: {
        id: true,
        title: true,
        status: true,
        visibility: true,
        version: true,
      },
    });

  if (
    publishedDocument?.status !== "PUBLISHED" ||
    publishedDocument.visibility !== "PUBLIC"
  ) {
    throw new Error(
      "RAG_TEST_PUBLICATION_VERIFICATION_FAILED"
    );
  }

  console.log(
    "SUCCESS: RAG test document is PUBLISHED and PUBLIC."
  );

  console.dir(publishedDocument, {
    depth: 5,
  });
}

// --------------------------------
// EXECUTE
// --------------------------------

main().catch((error) => {
  console.error(
    "RAG smoke-test publication failed:",
    error
  );

  process.exitCode = 1;
});
