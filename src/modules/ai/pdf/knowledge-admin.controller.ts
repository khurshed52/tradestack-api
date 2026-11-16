
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  unlink,
  realpath,
  stat,
} from "node:fs/promises";

import path from "node:path";

import prisma from "../../../db/db.config.js";

import {
  uploadKnowledgePdf,
} from "./knowledge-management.service.js";

import {
  publishKnowledgeDocument,
} from "../rag/knowledge-publication.service.js";

// ------------------------------------
// CONFIGURATION
// ------------------------------------

const KNOWLEDGE_STORAGE_DIR = path.resolve(
  process.env.KNOWLEDGE_STORAGE_DIR ??
    "storage/knowledge-documents",
);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------
// UPLOAD KNOWLEDGE PDF
// ------------------------------------

export const uploadKnowledgePdfController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const file = req.file;

  try {
    if (!file) {
      return res.status(400).json({
        statusCode: 400,
        message: "PDF file is required",
        data: null,
      });
    }

    const {
      title,
      slug,
      category,
      sourceUrl,
    } = req.body;

    if (
      typeof title !== "string" ||
      typeof slug !== "string" ||
      typeof category !== "string" ||
      (sourceUrl !== undefined &&
        typeof sourceUrl !== "string")
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid document metadata",
        data: null,
      });
    }

    const result = await uploadKnowledgePdf({
      filePath: file.path,
      title,
      slug,
      category,
      sourceUrl,
    });

    const statusCode = result.alreadyExists
      ? 200
      : 201;

    return res.status(statusCode).json({
      statusCode,
      message: result.alreadyExists
        ? "Document content already exists"
        : "New knowledge document version created as draft",
      data: result,
    });
  } catch (error) {
    next(error);
  } finally {
    // Remove the temporary uploaded file.
    // The permanent original is managed separately
    // by knowledge-storage.service.ts.
    if (file?.path) {
      try {
        await unlink(file.path);
      } catch (cleanupError) {
        console.error(
          "Failed to remove temporary PDF:",
          cleanupError,
        );
      }
    }
  }
};

// ------------------------------------
// PUBLISH KNOWLEDGE DOCUMENT
// ------------------------------------

export const publishKnowledgeDocumentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const documentId = req.params.documentId;

    if (
      typeof documentId !== "string" ||
      !UUID_REGEX.test(documentId)
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid document ID",
        data: null,
      });
    }

    // Use the authenticated admin identity.
    // Never accept adminUserId from the request body.
    const result = await publishKnowledgeDocument({
      documentId,
      adminUserId: req.user!.id,
    });

    return res.status(200).json({
      statusCode: 200,
      message:
        "Knowledge document published successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      const errorResponses: Record<
        string,
        {
          statusCode: number;
          message: string;
        }
      > = {
        INVALID_PUBLICATION_REQUEST: {
          statusCode: 400,
          message: "Invalid publication request",
        },

        KNOWLEDGE_PUBLICATION_FORBIDDEN: {
          statusCode: 403,
          message: "Admin access required",
        },

        KNOWLEDGE_DOCUMENT_NOT_FOUND: {
          statusCode: 404,
          message: "Knowledge document not found",
        },

        ONLY_DRAFT_DOCUMENTS_CAN_BE_PUBLISHED: {
          statusCode: 409,
          message:
            "Only draft documents can be published",
        },

        TRAINING_DOCUMENT_CANNOT_BE_PUBLISHED: {
          statusCode: 403,
          message:
            "Training documents cannot be published",
        },

        KNOWLEDGE_DOCUMENT_NOT_READY: {
          statusCode: 422,
          message:
            "Document chunks or embeddings are not ready",
        },
      };

      const response = errorResponses[error.message];

      if (response) {
        return res.status(
          response.statusCode,
        ).json({
          ...response,
          data: null,
        });
      }
    }

    next(error);
  }
};

// ------------------------------------
// PREVIEW ORIGINAL KNOWLEDGE PDF
// ------------------------------------

export const previewKnowledgePdfController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const documentId = req.params.documentId;

    // 1. Validate the document ID.
    if (
      typeof documentId !== "string" ||
      !UUID_REGEX.test(documentId)
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid document ID",
        data: null,
      });
    }

    // 2. Look up the stored PDF.
    // Never accept a file path from the request.
    const document =
      await prisma.knowledgeDocument.findUnique({
        where: {
          id: documentId,
        },
        select: {
          id: true,
          title: true,
          version: true,
          storagePath: true,
        },
      });

    if (!document) {
      return res.status(404).json({
        statusCode: 404,
        message: "Knowledge document not found",
        data: null,
      });
    }

    if (!document.storagePath) {
      return res.status(404).json({
        statusCode: 404,
        message:
          "Original PDF is not available for this document",
        data: null,
      });
    }

    // 3. Resolve actual filesystem paths.
    // realpath() also resolves symbolic links.
    let storageRoot: string;
    let pdfPath: string;

    try {
      storageRoot = await realpath(
        KNOWLEDGE_STORAGE_DIR,
      );

      pdfPath = await realpath(
        document.storagePath,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message: "Stored PDF file not found",
          data: null,
        });
      }

      throw error;
    }

    // 4. Prevent reading files outside
    // the configured private storage directory.
    const relativePath = path.relative(
      storageRoot,
      pdfPath,
    );

    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(
        `..${path.sep}`,
      ) ||
      path.isAbsolute(relativePath)
    ) {
      return res.status(403).json({
        statusCode: 403,
        message: "Invalid PDF storage location",
        data: null,
      });
    }

    // 5. Ensure the stored path is a regular PDF.
    const fileStats = await stat(pdfPath);

    if (
      !fileStats.isFile() ||
      path.extname(pdfPath).toLowerCase() !== ".pdf"
    ) {
      return res.status(404).json({
        statusCode: 404,
        message: "Stored PDF file not found",
        data: null,
      });
    }

    // 6. Prevent caching of potentially
    // private administrative documents.
    res.setHeader(
      "Cache-Control",
      "private, no-store",
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff",
    );

    // Display inside the browser/PDF viewer.
    // Use a generated filename rather than
    // returning the underlying filesystem path.
    const previewFilename =
      `knowledge-document-v${document.version}.pdf`;

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${previewFilename}"`,
    );

    res.type("application/pdf");

    // 7. Deliver the stored original PDF.
    return res.sendFile(
      pdfPath,
      (error) => {
        if (error) {
          if (!res.headersSent) {
            next(error);
          } else {
            res.destroy(error);
          }
        }
      },
    );
  } catch (error) {
    next(error);
  }
};
