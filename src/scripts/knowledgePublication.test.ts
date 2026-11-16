
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  transaction: vi.fn(),

  findDocument: vi.fn(),
  rawQuery: vi.fn(),
  archiveDocuments: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock("../db/db.config.js", () => ({
  default: {
    user: {
      findUnique: mocks.findUser,
    },
    $transaction: mocks.transaction,
  },
}));

import { publishKnowledgeDocument } from
  "../modules/ai/rag/knowledge-publication.service.js";

const DOCUMENT_ID =
  "11111111-1111-4111-8111-111111111111";

const ADMIN_ID =
  "22222222-2222-4222-8222-222222222222";

const validDocument = {
  id: DOCUMENT_ID,
  title: "TradePro Withdrawal Guide",
  slug: "tradepro-withdrawal-guide",
  version: 2,
  category: "WITHDRAWALS",
  status: "DRAFT",
  visibility: "INTERNAL",
};

const transactionClient = {
  knowledgeDocument: {
    findUnique: mocks.findDocument,
    updateMany: mocks.archiveDocuments,
    update: mocks.updateDocument,
  },
  $queryRaw: mocks.rawQuery,
  $executeRaw: vi.fn(),
};

describe("Knowledge document publication", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.findUser.mockResolvedValue({
      role: "ADMIN",
      isActive: true,
    });

    // Execute the real transaction callback using mocked
    // database operations.
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) =>
        Promise<unknown>) => callback(transactionClient),
    );

    mocks.findDocument.mockResolvedValue(validDocument);

    // PostgreSQL embedding validation result.
    mocks.rawQuery.mockResolvedValue([
      {
        total: 3n,
        invalid: 0n,
      },
    ]);

    mocks.archiveDocuments.mockResolvedValue({
      count: 1,
    });

    mocks.updateDocument.mockResolvedValue({
      ...validDocument,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    });
  });

  it("rejects a regular customer", async () => {
    mocks.findUser.mockResolvedValue({
      role: "USER",
      isActive: true,
    });

    await expect(
      publishKnowledgeDocument({
        documentId: DOCUMENT_ID,
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toThrow(
      "KNOWLEDGE_PUBLICATION_FORBIDDEN",
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an inactive administrator", async () => {
    mocks.findUser.mockResolvedValue({
      role: "ADMIN",
      isActive: false,
    });

    await expect(
      publishKnowledgeDocument({
        documentId: DOCUMENT_ID,
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toThrow(
      "KNOWLEDGE_PUBLICATION_FORBIDDEN",
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects missing identifiers", async () => {
    await expect(
      publishKnowledgeDocument({
        documentId: "",
        adminUserId: "",
      }),
    ).rejects.toThrow("INVALID_PUBLICATION_REQUEST");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("publishes an approved draft", async () => {
    const result = await publishKnowledgeDocument({
      documentId: DOCUMENT_ID,
      adminUserId: ADMIN_ID,
    });

    expect(result).toEqual({
      documentId: DOCUMENT_ID,
      title: "TradePro Withdrawal Guide",
      slug: "tradepro-withdrawal-guide",
      version: 2,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      chunkCount: 3,
    });

    expect(mocks.updateDocument).toHaveBeenCalledWith({
      where: {
        id: DOCUMENT_ID,
      },
      data: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
    });
  });

  it("rejects the internal training PDF", async () => {
    mocks.findDocument.mockResolvedValue({
      ...validDocument,
      slug: "tradepro-ai-sample-knowledge-base",
      category: "TRAINING",
    });

    await expect(
      publishKnowledgeDocument({
        documentId: DOCUMENT_ID,
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toThrow(
      "TRAINING_DOCUMENT_CANNOT_BE_PUBLISHED",
    );

    expect(mocks.archiveDocuments).not.toHaveBeenCalled();
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it("rejects a document without valid embeddings", async () => {
    mocks.rawQuery
      // Second raw query: embedding validation.
      .mockResolvedValueOnce([
        {
          total: 3n,
          invalid: 1n,
        },
      ]);

    await expect(
      publishKnowledgeDocument({
        documentId: DOCUMENT_ID,
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toThrow(
      "KNOWLEDGE_DOCUMENT_NOT_READY",
    );

    expect(mocks.archiveDocuments).not.toHaveBeenCalled();
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it("archives the old version before publishing the new one", async () => {
    await publishKnowledgeDocument({
      documentId: DOCUMENT_ID,
      adminUserId: ADMIN_ID,
    });

    expect(mocks.archiveDocuments).toHaveBeenCalledWith({
      where: {
        slug: "tradepro-withdrawal-guide",
        status: "PUBLISHED",
      },
      data: {
        status: "ARCHIVED",
      },
    });

    expect(mocks.updateDocument).toHaveBeenCalledOnce();

    const archiveOrder =
      mocks.archiveDocuments.mock.invocationCallOrder[0];

    const publishOrder =
      mocks.updateDocument.mock.invocationCallOrder[0];

    expect(archiveOrder).toBeLessThan(publishOrder);
  });

  it("propagates a database publishing failure", async () => {
    mocks.updateDocument.mockRejectedValue(
      new Error("DATABASE_WRITE_FAILED"),
    );

    await expect(
      publishKnowledgeDocument({
        documentId: DOCUMENT_ID,
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toThrow("DATABASE_WRITE_FAILED");

    expect(mocks.archiveDocuments).toHaveBeenCalledOnce();
    expect(mocks.updateDocument).toHaveBeenCalledOnce();
  });
});
