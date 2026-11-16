
import prisma from "../../../db/db.config.js";

import { extractPdfText } from "./pdf.service.js";

import {
  storeKnowledgePdf,
  removeStoredKnowledgePdf,
} from "./knowledge-storage.service.js";

import {
  computeKnowledgeContentHash,
  ingestKnowledgeDocument,
} from "../rag/ingestion.service.js";

export interface UploadKnowledgePdfInput {
  filePath: string;
  title: string;
  slug: string;
  category: string;
  sourceUrl?: string;
}

export interface UploadKnowledgePdfResult {
  documentId: string;
  title: string;
  version: number;
  chunkCount: number;
  alreadyExists: boolean;
  storagePath: string | null;
}

const MAX_VERSION_ATTEMPTS = 5;

function isUniqueConstraintError(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Ensure the original PDF is stored and linked
 * to the corresponding KnowledgeDocument.
 *
 * Uses a conditional database update so concurrent
 * requests cannot overwrite an existing storage path.
 */
async function ensurePdfStorage(
  documentId: string,
  slug: string,
  version: number,
  sourceFilePath: string,
): Promise<string> {
  const document =
    await prisma.knowledgeDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        storagePath: true,
      },
    });

  if (!document) {
    throw new Error("KNOWLEDGE_DOCUMENT_NOT_FOUND");
  }

  // The original PDF is already linked.
  if (document.storagePath) {
    return document.storagePath;
  }

  // Store the original PDF in private storage.
  const stored = await storeKnowledgePdf({
    sourceFilePath,
    slug,
    version,
  });

  try {
    // Only set the path if no other request
    // has linked a PDF already.
    const updated =
      await prisma.knowledgeDocument.updateMany({
        where: {
          id: documentId,
          storagePath: null,
        },
        data: {
          storagePath: stored.storagePath,
        },
      });

    if (updated.count === 1) {
      return stored.storagePath;
    }

    // Another concurrent upload may have won.
    const current =
      await prisma.knowledgeDocument.findUnique({
        where: {
          id: documentId,
        },
        select: {
          storagePath: true,
        },
      });

    if (!current?.storagePath) {
      throw new Error(
        "KNOWLEDGE_PDF_STORAGE_LINK_FAILED",
      );
    }

    // Our copy is unnecessary. Remove it.
    await removeStoredKnowledgePdf(
      stored.storagePath,
    );

    return current.storagePath;
  } catch (error) {
    // Avoid orphaning a file when linking fails.
    try {
      await removeStoredKnowledgePdf(
        stored.storagePath,
      );
    } catch (cleanupError) {
      console.error(
        "Failed to clean up knowledge PDF:",
        cleanupError,
      );
    }

    throw error;
  }
}

/**
 * Retrieve an existing document's metadata
 * and ensure its original PDF is retained.
 */
async function getExistingDocumentResult(
  documentId: string,
  sourceFilePath: string,
): Promise<UploadKnowledgePdfResult> {
  const document =
    await prisma.knowledgeDocument.findUnique({
      where: {
        id: documentId,
      },
      include: {
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });

  if (!document) {
    throw new Error("KNOWLEDGE_DOCUMENT_NOT_FOUND");
  }

  const storagePath = await ensurePdfStorage(
    document.id,
    document.slug,
    document.version,
    sourceFilePath,
  );

  return {
    documentId: document.id,
    title: document.title,
    version: document.version,
    chunkCount: document._count.chunks,
    alreadyExists: true,
    storagePath,
  };
}

/**
 * Upload a knowledge PDF.
 *
 * - Automatically detects changed content.
 * - Automatically assigns version numbers.
 * - Avoids duplicate document versions.
 * - Retains original PDFs privately.
 * - Stores document paths in PostgreSQL.
 * - Reuses existing RAG ingestion services.
 *
 * New versions are created as DRAFT / INTERNAL.
 */
export async function uploadKnowledgePdf(
  input: UploadKnowledgePdfInput,
): Promise<UploadKnowledgePdfResult> {
  const title = input.title?.trim();
  const slug = input.slug?.trim();
  const category = input.category?.trim();

  const sourceUrl =
    input.sourceUrl?.trim() || undefined;

  // ---------------------------------------
  // 1. Validate document metadata
  // ---------------------------------------

  if (!title || !slug || !category) {
    throw new Error(
      "INVALID_KNOWLEDGE_DOCUMENT",
    );
  }

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new Error(
      "INVALID_DOCUMENT_SLUG",
    );
  }

  if (sourceUrl) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new Error("INVALID_SOURCE_URL");
    }

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      throw new Error("INVALID_SOURCE_URL");
    }
  }

  // ---------------------------------------
  // 2. Extract PDF content
  // ---------------------------------------

  const extracted = await extractPdfText(
    input.filePath,
  );

  // ---------------------------------------
  // 3. Calculate normalized content hash
  // ---------------------------------------

  const contentHash =
    computeKnowledgeContentHash({
      pages: extracted.pages,
    });

  // ---------------------------------------
  // 4. Find matching existing content
  // ---------------------------------------

  const matchingDocument =
    await prisma.knowledgeDocument.findFirst({
      where: {
        slug,
        contentHash,
      },
      orderBy: {
        version: "desc",
      },
      select: {
        id: true,
      },
    });

  if (matchingDocument) {
    return getExistingDocumentResult(
      matchingDocument.id,
      input.filePath,
    );
  }

  // ---------------------------------------
  // 5. Assign the next version automatically
  // ---------------------------------------

  for (
    let attempt = 0;
    attempt < MAX_VERSION_ATTEMPTS;
    attempt++
  ) {
    const latest =
      await prisma.knowledgeDocument.findFirst({
        where: {
          slug,
        },
        orderBy: {
          version: "desc",
        },
        select: {
          version: true,
        },
      });

    const nextVersion =
      (latest?.version ?? 0) + 1;

    let result: Awaited<
      ReturnType<typeof ingestKnowledgeDocument>
    >;

    // ---------------------------------------
    // 6. Ingest through the existing RAG
    // pipeline
    // ---------------------------------------

    try {
      result = await ingestKnowledgeDocument({
        title,
        slug,
        category,
        sourceUrl,
        version: nextVersion,
        pages: extracted.pages,
      });
    } catch (error) {
      const versionConflict =
        error instanceof Error &&
        error.message.startsWith(
          "DOCUMENT_VERSION_CONFLICT",
        );

      if (
        !isUniqueConstraintError(error) &&
        !versionConflict
      ) {
        throw error;
      }

      // Another request may have created
      // the same document version.
      const matchingAfterConflict =
        await prisma.knowledgeDocument.findFirst({
          where: {
            slug,
            contentHash,
          },
          orderBy: {
            version: "desc",
          },
          select: {
            id: true,
          },
        });

      if (matchingAfterConflict) {
        return getExistingDocumentResult(
          matchingAfterConflict.id,
          input.filePath,
        );
      }

      // Different content won the version race.
      // Retry using the newest version number.
      continue;
    }

    // ---------------------------------------
    // 7. Persist the original PDF and link it
    // to the knowledge document
    // ---------------------------------------

    const storagePath = await ensurePdfStorage(
      result.documentId,
      slug,
      result.version,
      input.filePath,
    );

    // ---------------------------------------
    // 8. Return the newly ingested document
    // ---------------------------------------

    return {
      documentId: result.documentId,
      title: result.title,
      version: result.version,
      chunkCount: result.chunkCount,
      alreadyExists: result.alreadyExists,
      storagePath,
    };
  }

  throw new Error(
    "DOCUMENT_VERSION_RETRY_EXHAUSTED",
  );
}
