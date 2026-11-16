import prisma from "../../../db/db.config.js";

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  generateEmbedding,
} from "./embedding.service.js";

// ------------------------------------
// TYPES
// ------------------------------------

export interface SearchKnowledgeInput {
  question: string;
  limit?: number;
  category?: string;
  minSimilarity?: number;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  category: string;
  sourceUrl: string | null;
  version: number;
  chunkIndex: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  content: string;
  similarity: number;
}

// Private fields used for ranking; callers receive KnowledgeSearchResult only.
type RankedKnowledgeResult = KnowledgeSearchResult & {
  lexicalStrength: number;
  hybridScore: number;
};

// ------------------------------------
// CONFIGURATION
// ------------------------------------

export const DEFAULT_MIN_SIMILARITY = 0.65;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_QUESTION_LENGTH = 4000;

// RRF combines two rankings without comparing incompatible raw scores.
const RRF_K = 60;
const LEXICAL_WEIGHT = 1.2;
const MIN_LEXICAL_STRENGTH = 0.05;
const MAX_LEXICAL_SIMILARITY_RELAXATION = 0.15;

function validateSimilarity(value: number): void {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new Error("INVALID_SIMILARITY_THRESHOLD");
  }
}

// This basic guard is not a replacement for approving PDFs before publishing.
function containsUnverifiedContent(
  content: string,
  sectionTitle: string | null,
): boolean {
  const text = [sectionTitle ?? "", content].join(" ");

  return (
    /\[(?:CONFIRM|TO BE CONFIRMED|TODO)[^\]]*\]/i.test(text) ||
    /\b(?:developer notes?|internal only|training only|unverified)\b/i.test(text)
  );
}

function normalizedTokens(content: string): Set<string> {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  return new Set(normalized.match(/\p{L}+[\p{L}\p{N}]*/gu) ?? []);
}

// ------------------------------------
// SHARED HYBRID RETRIEVAL
// ------------------------------------

async function searchKnowledgeCore(
  input: SearchKnowledgeInput,
  trainingMode: boolean,
  signal?: AbortSignal,
): Promise<KnowledgeSearchResult[]> {
  const question = input.question?.trim();
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    throw new Error("INVALID_KNOWLEDGE_QUESTION");
  }

  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error("INVALID_RETRIEVAL_LIMIT");
  }

  const category = input.category?.trim() || null;
  if (category && category.length > 100) {
    throw new Error("INVALID_KNOWLEDGE_CATEGORY");
  }

  const requestedSimilarity =
    input.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  validateSimilarity(requestedSimilarity);

  // A customer request cannot lower the normal semantic floor.
  const minSimilarity = trainingMode
    ? requestedSimilarity
    : Math.max(requestedSimilarity, DEFAULT_MIN_SIMILARITY);

  signal?.throwIfAborted();
  const embedding = await generateEmbedding(question, signal);
  signal?.throwIfAborted();
  if (
    embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every(Number.isFinite)
  ) {
    throw new Error("INVALID_QUERY_EMBEDDING");
  }

  const vectorValue = `[${embedding.join(",")}]`;
  const candidatePoolSize = Math.max(80, limit * 20);

  // Both search branches use exactly the SAME eligibility rules.
  // A keyword match cannot reintroduce an archived/internal/old document.
  // websearch_to_tsquery safely parses the customer question as search terms.
  // RRF merges the semantic and PostgreSQL full-text rankings.
  const results = await prisma.$queryRaw<RankedKnowledgeResult[]>`
    WITH search_input AS (
      SELECT
        ${vectorValue}::vector(768) AS query_embedding,
        websearch_to_tsquery('english', ${question}) AS text_query
    ),
    eligible AS MATERIALIZED (
      SELECT
        c."id" AS "chunkId",
        d."id" AS "documentId",
        d."title",
        d."category",
        d."sourceUrl",
        d."version",
        c."chunkIndex",
        c."pageNumber",
        c."sectionTitle",
        c."content",
        c."embedding"
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDocument" d
        ON d."id" = c."documentId"
      WHERE c."embedding" IS NOT NULL
        AND c."embeddingModel" = ${EMBEDDING_MODEL}
        AND (
          ${category}::text IS NULL
          OR d."category" = ${category}::text
        )
        AND (
          (
            ${trainingMode}::boolean = FALSE
            AND d."status" = 'PUBLISHED'::"KnowledgeDocumentStatus"
            AND d."visibility" = 'PUBLIC'::"KnowledgeVisibility"
            AND UPPER(TRIM(d."category")) <> 'TRAINING'
            AND d."slug" <> 'tradepro-ai-sample-knowledge-base' 
            AND d."version" = (
              SELECT MAX(latest."version")
              FROM "KnowledgeDocument" latest
              WHERE latest."slug" = d."slug"
                AND latest."status" = 'PUBLISHED'::"KnowledgeDocumentStatus"
                AND latest."visibility" = 'PUBLIC'::"KnowledgeVisibility"
            )
          )
          OR
          (
            ${trainingMode}::boolean = TRUE
            AND UPPER(d."category") = 'TRAINING'
            AND d."status" = 'DRAFT'::"KnowledgeDocumentStatus"
            AND d."visibility" = 'INTERNAL'::"KnowledgeVisibility"
            AND d."version" = (
              SELECT MAX(latest."version")
              FROM "KnowledgeDocument" latest
              WHERE latest."slug" = d."slug"
                AND latest."status" = 'DRAFT'::"KnowledgeDocumentStatus"
                AND latest."visibility" = 'INTERNAL'::"KnowledgeVisibility"
            )
          )
        )
    ),
    semantic_top AS (
      SELECT ranked."chunkId", ranked."semanticRank"
      FROM (
        SELECT
          e."chunkId",
          ROW_NUMBER() OVER (
            ORDER BY e."embedding" <=> s.query_embedding, e."chunkId"
          ) AS "semanticRank"
        FROM eligible e CROSS JOIN search_input s
      ) ranked
      WHERE ranked."semanticRank" <= ${candidatePoolSize}
    ),
    lexical_scored AS (
      SELECT
        e."chunkId",
        ts_rank_cd(
          to_tsvector(
            'english',
            concat_ws(' ', e."title", e."sectionTitle", e."content")
          ),
          s.text_query
        )::double precision AS "lexicalStrength"
      FROM eligible e CROSS JOIN search_input s
      WHERE to_tsvector(
        'english',
        concat_ws(' ', e."title", e."sectionTitle", e."content")
      ) @@ s.text_query
    ),
    lexical_top AS (
      SELECT ranked."chunkId", ranked."lexicalStrength", ranked."lexicalRank"
      FROM (
        SELECT
          l."chunkId",
          l."lexicalStrength",
          ROW_NUMBER() OVER (
            ORDER BY l."lexicalStrength" DESC, l."chunkId"
          ) AS "lexicalRank"
        FROM lexical_scored l
        WHERE l."lexicalStrength" > 0
      ) ranked
      WHERE ranked."lexicalRank" <= ${candidatePoolSize}
    ),
    fused AS (
      SELECT
        COALESCE(v."chunkId", t."chunkId") AS "chunkId",
        (
          COALESCE(1.0 / (${RRF_K}::double precision + v."semanticRank"), 0) +
          ${LEXICAL_WEIGHT}::double precision *
            COALESCE(1.0 / (${RRF_K}::double precision + t."lexicalRank"), 0)
        )::double precision AS "hybridScore",
        COALESCE(t."lexicalStrength", 0)::double precision AS "lexicalStrength"
      FROM semantic_top v
      FULL OUTER JOIN lexical_top t ON t."chunkId" = v."chunkId"
    )
    SELECT
      e."chunkId",
      e."documentId",
      e."title",
      e."category",
      e."sourceUrl",
      e."version",
      e."chunkIndex",
      e."pageNumber",
      e."sectionTitle",
      e."content",
      (1 - (e."embedding" <=> s.query_embedding))::double precision
        AS "similarity",
      f."hybridScore",
      f."lexicalStrength"
    FROM fused f
    JOIN eligible e ON e."chunkId" = f."chunkId"
    CROSS JOIN search_input s
    ORDER BY f."hybridScore" DESC, "similarity" DESC, e."chunkId"
    LIMIT ${candidatePoolSize}
  `;

  const allowDevelopmentTestContent =
    trainingMode;

  signal?.throwIfAborted();
  const seenContents = new Set<string>();
  const seenTokenSets: Set<string>[] = [];
  const selected: KnowledgeSearchResult[] = [];

  for (const result of results) {
    if (
      !Number.isFinite(result.similarity) ||
      !Number.isFinite(result.hybridScore) ||
      !Number.isFinite(result.lexicalStrength)
    ) {
      continue;
    }

    const strongSemanticMatch = result.similarity >= minSimilarity;
    const strongHybridMatch =
      result.lexicalStrength >= MIN_LEXICAL_STRENGTH &&
      result.similarity >=
        minSimilarity - MAX_LEXICAL_SIMILARITY_RELAXATION;

    if (!strongSemanticMatch && !strongHybridMatch) continue;

    if (
      containsUnverifiedContent(result.content, result.sectionTitle) &&
      !(
        allowDevelopmentTestContent &&
        result.category.trim().toUpperCase() === "TRAINING"
      )
    ) {
      continue;
    }

    if (
      result.pageNumber !== null &&
      (!Number.isSafeInteger(result.pageNumber) || result.pageNumber < 1)
    ) {
      continue;
    }

    const contentKey = result.content.toLowerCase().replace(/\s+/g, " ").trim();
    if (!contentKey || seenContents.has(contentKey)) continue;

    const tokens = normalizedTokens(contentKey);
    const nearDuplicate =
      tokens.size >= 20 &&
      seenTokenSets.some((previous) => {
        const shared = [...tokens].filter((token) => previous.has(token)).length;
        const union = tokens.size + previous.size - shared;
        return union > 0 && shared / union >= 0.9;
      });
    if (nearDuplicate) continue;

    seenContents.add(contentKey);
    seenTokenSets.push(tokens);

    // Do not expose internal hybrid-ranking fields to RAG tools or callers.
    selected.push({
      chunkId: result.chunkId,
      documentId: result.documentId,
      title: result.title,
      category: result.category,
      sourceUrl: result.sourceUrl,
      version: result.version,
      chunkIndex: result.chunkIndex,
      pageNumber: result.pageNumber,
      sectionTitle: result.sectionTitle,
      content: result.content,
      similarity: result.similarity,
    });

    if (selected.length >= limit) break;
  }

  return selected;
}

// ------------------------------------
// CUSTOMER KNOWLEDGE SEARCH
// ------------------------------------

export async function searchKnowledge(
  input: SearchKnowledgeInput,
  signal?: AbortSignal,
): Promise<KnowledgeSearchResult[]> {
  return searchKnowledgeCore(input, false, signal);
}

// ------------------------------------
// DEVELOPMENT-ONLY TRAINING SEARCH
// ------------------------------------

// Never expose this function through customer routes or Gemini tools.
export async function searchTrainingKnowledge(
  input: SearchKnowledgeInput,
): Promise<KnowledgeSearchResult[]> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("TRAINING_RETRIEVAL_DISABLED");
  }
  return searchKnowledgeCore(input, true);
}
