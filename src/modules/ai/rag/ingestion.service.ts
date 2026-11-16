import { createHash, randomUUID } from "node:crypto";

import prisma from "../../../db/db.config.js";
import { chunkText } from "./chunking.service.js";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  generateEmbedding,
} from "./embedding.service.js";

export interface KnowledgeSourcePage {
  pageNumber: number;
  content: string;
}

export interface IngestKnowledgeDocumentInput {
  title: string;
  slug: string;
  category: string;
  version?: number;
  sourceUrl?: string;

  // Supply either plain text OR extracted PDF pages.
  content?: string;
  pages?: KnowledgeSourcePage[];
}

export interface IngestKnowledgeDocumentResult {
  documentId: string;
  title: string;
  version: number;
  chunkCount: number;
  alreadyExists: boolean;
}

interface PreparedChunk {
  chunkIndex: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  content: string;
  vector: number[];
}

const MAX_DOCUMENT_CHARS = 100_000;
const MAX_DOCUMENT_CHUNKS = 200;
const MAX_DOCUMENT_PAGES = 100;
const MAX_CHUNK_CHARS = 1200;

function prepareSource(
  input: Pick<IngestKnowledgeDocumentInput, "content" | "pages">,
): {
  normalizedSource: string;
  chunks: Array<{
    chunkIndex: number;
    pageNumber: number | null;
    sectionTitle: string | null;
    content: string;
  }>;
} {
  const hasContent = typeof input.content === "string";
  const hasPages = input.pages !== undefined;

  if (hasContent === hasPages) {
    throw new Error("PROVIDE_EITHER_CONTENT_OR_PAGES");
  }

  if (hasContent) {
    const content = input.content!.trim();

    if (!content || content.length > MAX_DOCUMENT_CHARS) {
      throw new Error("INVALID_DOCUMENT_CONTENT");
    }

    return {
      normalizedSource: JSON.stringify({
        type: "text",
        content,
      }),
      chunks: chunkText(content, MAX_CHUNK_CHARS).map(
        (chunk) => ({
          ...chunk,
          pageNumber: null,
          sectionTitle: chunk.sectionTitle,
        }),
      ),
    };
  }

  const pages = input.pages!;

  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    pages.length > MAX_DOCUMENT_PAGES
  ) {
    throw new Error("INVALID_DOCUMENT_PAGES");
  }

  const seenPageNumbers = new Set<number>();
  let totalCharacters = 0;

  const normalizedPages = pages
    .map((page) => {
      if (
        !Number.isInteger(page.pageNumber) ||
        page.pageNumber < 1 ||
        seenPageNumbers.has(page.pageNumber) ||
        typeof page.content !== "string"
      ) {
        throw new Error("INVALID_PDF_PAGE");
      }

      seenPageNumbers.add(page.pageNumber);

      const content = page.content.trim();
      totalCharacters += content.length;

      return {
        pageNumber: page.pageNumber,
        content,
      };
    })
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (
    totalCharacters === 0 ||
    totalCharacters > MAX_DOCUMENT_CHARS
  ) {
    throw new Error("INVALID_DOCUMENT_CONTENT");
  }

  const chunks: Array<{
    chunkIndex: number;
    pageNumber: number;
    sectionTitle: string | null;
    content: string;
  }> = [];

  let currentSectionTitle: string | null = null;
  for (const page of normalizedPages) {
    if (!page.content) continue;

    // Each chunk belongs to exactly one PDF page.
    const pageChunks = chunkText(
      page.content,
      MAX_CHUNK_CHARS,
    );

    for (const chunk of pageChunks) {
      currentSectionTitle = chunk.sectionTitle ?? currentSectionTitle;
      chunks.push({
        chunkIndex: chunks.length,
        pageNumber: page.pageNumber,
        sectionTitle: currentSectionTitle,
        content: chunk.content,
      });
    }
  }

  return {
    normalizedSource: JSON.stringify({
      type: "pdf-pages",
      pages: normalizedPages,
    }),
    chunks,
  };
}

// Reuse the exact same normalized content hash when checking whether
// a PDF upload has changed and when persisting the ingested document.
function hashNormalizedSource(normalizedSource: string): string {
  return createHash("sha256")
    .update(normalizedSource)
    .digest("hex");
}

export function computeKnowledgeContentHash(
  input: Pick<IngestKnowledgeDocumentInput, "content" | "pages">,
): string {
  const source = prepareSource(input);
  return hashNormalizedSource(source.normalizedSource);
}

export async function ingestKnowledgeDocument(
  input: IngestKnowledgeDocumentInput,
): Promise<IngestKnowledgeDocumentResult> {
  const title = input.title?.trim();
  const slug = input.slug?.trim();
  const category = input.category?.trim();
  const version = input.version ?? 1;
  const sourceUrl = input.sourceUrl?.trim() || undefined;

  if (!title || !slug || !category) {
    throw new Error("INVALID_KNOWLEDGE_DOCUMENT");
  }

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new Error("INVALID_DOCUMENT_SLUG");
  }

  if (
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new Error("INVALID_DOCUMENT_VERSION");
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

  // 1. Prepare plain-text or page-aware PDF chunks.
  const source = prepareSource(input);

  if (
    source.chunks.length === 0 ||
    source.chunks.length > MAX_DOCUMENT_CHUNKS
  ) {
    throw new Error("INVALID_DOCUMENT_CHUNK_COUNT");
  }

  // Include source type and page boundaries in the hash.
  const contentHash = hashNormalizedSource(source.normalizedSource);

  // 2. Check for an existing document before generating
  // embeddings, avoiding unnecessary Gemini API calls.
  const existing =
    await prisma.knowledgeDocument.findUnique({
      where: {
        slug_version: {
          slug,
          version,
        },
      },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

  if (existing) {
    if (existing.contentHash !== contentHash) {
      throw new Error(
        "DOCUMENT_VERSION_CONFLICT: Use a new version for changed content.",
      );
    }

    return {
      documentId: existing.id,
      title: existing.title,
      version: existing.version,
      chunkCount: existing._count.chunks,
      alreadyExists: true,
    };
  }

  // 3. Generate embeddings before opening the transaction.
  const preparedChunks: PreparedChunk[] = [];

  for (const chunk of source.chunks) {
    const vector = await generateEmbedding(chunk.content);

    if (
      vector.length !== EMBEDDING_DIMENSIONS ||
      !vector.every(Number.isFinite)
    ) {
      throw new Error("INVALID_EMBEDDING");
    }

    preparedChunks.push({
      ...chunk,
      vector,
    });
  }

  // 4. Write all records atomically.
  const document = await prisma.$transaction(
    async (tx) => {
      const created = await tx.knowledgeDocument.create({
        data: {
          title,
          slug,
          category,
          version,
          sourceUrl,
          contentHash,
          status: "DRAFT",
          visibility: "INTERNAL",
        },
      });

      for (const chunk of preparedChunks) {
        const chunkId = randomUUID();
        const vectorValue = `[${chunk.vector.join(",")}]`;

        await tx.$executeRaw`
          INSERT INTO "KnowledgeChunk" (
            "id",
            "documentId",
            "chunkIndex",
            "pageNumber",
            "sectionTitle",
            "content",
            "embedding",
            "embeddingModel"
          )
          VALUES (
            ${chunkId}::uuid,
            ${created.id}::uuid,
            ${chunk.chunkIndex},
            ${chunk.pageNumber},
            ${chunk.sectionTitle},
            ${chunk.content},
            ${vectorValue}::vector(768),
            ${EMBEDDING_MODEL}
          )
        `;
      }

      return created;
    },
    {
      timeout: 30_000,
    },
  );

  return {
    documentId: document.id,
    title: document.title,
    version: document.version,
    chunkCount: preparedChunks.length,
    alreadyExists: false,
  };
}
