
import prisma from "../../../db/db.config.js";

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./embedding.service.js";

// ------------------------------------
// TYPES
// ------------------------------------

interface PublishKnowledgeDocumentInput {
  documentId: string;
  adminUserId: string;
}

interface EmbeddingCheckRow {
  total: bigint;
  invalid: bigint;
}

// ------------------------------------
// PUBLISH KNOWLEDGE DOCUMENT
// ------------------------------------

export async function publishKnowledgeDocument(
  input: PublishKnowledgeDocumentInput,
) {
  const { documentId, adminUserId } = input;

  // ------------------------------------
  // 1. VALIDATE REQUEST
  // ------------------------------------

  if (!documentId || !adminUserId) {
    throw new Error("INVALID_PUBLICATION_REQUEST");
  }

  // ------------------------------------
  // 2. VERIFY ADMIN AGAINST DATABASE
  // ------------------------------------

  // Always use the authenticated user ID.
  // Never trust an admin ID provided by req.body.

  const admin = await prisma.user.findUnique({
    where: {
      id: adminUserId,
    },
    select: {
      role: true,
      isActive: true,
    },
  });

  if (
    !admin ||
    !admin.isActive ||
    admin.role !== "ADMIN"
  ) {
    throw new Error(
      "KNOWLEDGE_PUBLICATION_FORBIDDEN",
    );
  }

  // ------------------------------------
  // 3. DATABASE TRANSACTION
  // ------------------------------------

  return prisma.$transaction(
    async (tx) => {
      const initial =
        await tx.knowledgeDocument.findUnique({
          where: {
            id: documentId,
          },
          select: {
            slug: true,
          },
        });

      if (!initial) {
        throw new Error(
          "KNOWLEDGE_DOCUMENT_NOT_FOUND",
        );
      }

      // ------------------------------------
      // 4. LOCK DOCUMENT GROUP BY SLUG
      // ------------------------------------

      // Prevent simultaneous publication
      // of competing versions of the
      // same knowledge document.

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          724201,
          hashtext(${initial.slug})
        )
      `;

      // Reload the document after obtaining
      // the publication lock.

      const document =
        await tx.knowledgeDocument.findUnique({
          where: {
            id: documentId,
          },
        });

      if (!document) {
        throw new Error(
          "KNOWLEDGE_DOCUMENT_NOT_FOUND",
        );
      }

      // ------------------------------------
      // 5. REQUIRE DRAFT STATUS
      // ------------------------------------

      if (document.status !== "DRAFT") {
        throw new Error(
          "ONLY_DRAFT_DOCUMENTS_CAN_BE_PUBLISHED",
        );
      }

      // ------------------------------------
      // 6. TRAINING DOCUMENT RESTRICTION
      // ------------------------------------

      // Use document category instead of
      // hardcoded document names or slugs.
      //
      // Production:
      //   TRAINING documents cannot be published.
      //
      // Development:
      //   Allow TRAINING publication only when
      //   explicitly enabled with an environment flag.

      const isTrainingDocument =
        document.category.trim().toUpperCase() ===
        "TRAINING";

      const allowDevelopmentPublication =
        process.env.NODE_ENV === "development" &&
        process.env.ALLOW_TEST_KNOWLEDGE_PUBLICATION ===
          "true";

      if (
        isTrainingDocument &&
        !allowDevelopmentPublication
      ) {
        throw new Error(
          "TRAINING_DOCUMENT_CANNOT_BE_PUBLISHED",
        );
      }

      // ------------------------------------
      // 7. VERIFY CHUNKS AND EMBEDDINGS
      // ------------------------------------

      const checks =
        await tx.$queryRaw<EmbeddingCheckRow[]>`
          SELECT
            COUNT(*)::bigint AS "total",

            COUNT(*) FILTER (
              WHERE "embedding" IS NULL
                OR "embeddingModel" IS NULL
                OR "embeddingModel" <> ${EMBEDDING_MODEL}
                OR vector_dims("embedding") <> ${EMBEDDING_DIMENSIONS}
            )::bigint AS "invalid"

          FROM "KnowledgeChunk"
          WHERE "documentId" = ${documentId}::uuid
        `;

      const totalChunks = Number(
        checks[0]?.total ?? 0n,
      );

      const invalidChunks = Number(
        checks[0]?.invalid ?? 0n,
      );

      if (
        totalChunks === 0 ||
        invalidChunks > 0
      ) {
        throw new Error(
          "KNOWLEDGE_DOCUMENT_NOT_READY",
        );
      }

      // ------------------------------------
      // 8. ARCHIVE PREVIOUS PUBLISHED VERSION
      // ------------------------------------

      // Only versions belonging to the same
      // document slug are affected.
      //
      // Other PDFs remain unchanged.

      await tx.knowledgeDocument.updateMany({
        where: {
          slug: document.slug,
          status: "PUBLISHED",
        },
        data: {
          status: "ARCHIVED",
        },
      });

      // ------------------------------------
      // 9. PUBLISH THE SELECTED VERSION
      // ------------------------------------

      await tx.knowledgeDocument.update({
        where: {
          id: document.id,
        },
        data: {
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
      });

      // ------------------------------------
      // 10. RETURN PUBLICATION RESULT
      // ------------------------------------

            return {
            documentId: document.id,
            title: document.title,
            slug: document.slug,
            version: document.version,
            status: "PUBLISHED" as const,
            visibility: "PUBLIC" as const,
            chunkCount: totalChunks,
            };
    },
    {
      timeout: 15_000,
    },
  );
}
