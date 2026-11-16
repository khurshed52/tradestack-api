
import { Router } from "express";
import type { RequestHandler } from "express";

import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { authenticate } from "../../../middleware/authenticate.js";
import { requireAdmin } from "../../../middleware/requireAdmin.js";

import {
  uploadKnowledgePdfController, publishKnowledgeDocumentController, previewKnowledgePdfController
} from "./knowledge-admin.controller.js";



const router = Router();

const MAX_PDF_BYTES = 20 * 1024 * 1024;

// Temporary upload directory.
// Original PDFs are stored permanently by
// knowledge-storage.service.ts.
const TEMP_UPLOAD_DIR = path.join(
  tmpdir(),
  "tradepro-knowledge-uploads",
);

mkdirSync(TEMP_UPLOAD_DIR, {
  recursive: true,
  mode: 0o700,
});

const storage = multer.diskStorage({
  destination: (
    _req,
    _file,
    callback,
  ) => {
    callback(null, TEMP_UPLOAD_DIR);
  },

  filename: (
    _req,
    _file,
    callback,
  ) => {
    // Never trust the original uploaded filename.
    callback(null, `${randomUUID()}.pdf`);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_PDF_BYTES,
    files: 1,
    fields: 4,
    parts: 5,
  },

  fileFilter: (
    _req,
    file,
    callback,
  ) => {
    if (file.mimetype !== "application/pdf") {
      callback(
        new Error("ONLY_PDF_FILES_ALLOWED"),
      );
      return;
    }

    callback(null, true);
  },
});

// Convert expected upload errors into readable
// API responses instead of generic server errors.
const uploadSinglePdf: RequestHandler = (
  req,
  res,
  next,
) => {
  upload.single("file")(
    req,
    res,
    (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        const tooLarge =
          error.code === "LIMIT_FILE_SIZE";

        res.status(tooLarge ? 413 : 400).json({
          statusCode: tooLarge ? 413 : 400,
          message: tooLarge
            ? "PDF must not exceed 20 MB"
            : "Invalid PDF upload",
          data: null,
        });

        return;
      }

      if (
        error instanceof Error &&
        error.message === "ONLY_PDF_FILES_ALLOWED"
      ) {
        res.status(400).json({
          statusCode: 400,
          message: "Only PDF files are allowed",
          data: null,
        });

        return;
      }

      next(error);
    },
  );
};

// -----------------------------------------
// ADMIN: UPLOAD KNOWLEDGE PDF
// -----------------------------------------
//
// POST /documents/upload
//
// multipart/form-data:
//   file      -> PDF
//   title     -> Document title
//   slug      -> Stable document identifier
//   category  -> Knowledge category
//   sourceUrl -> Optional
//
// The backend automatically assigns versions.
// No "version" field is accepted.
//
// Newly ingested versions remain DRAFT / INTERNAL.

router.post(
  "/documents/upload",
  authenticate,
  requireAdmin,
  uploadSinglePdf,
  uploadKnowledgePdfController,
);

router.get(
  "/documents/:documentId/file",
  authenticate,
  requireAdmin,
  previewKnowledgePdfController,
);

router.post(
  "/documents/:documentId/publish",
  authenticate,
  requireAdmin,
  publishKnowledgeDocumentController,
);


export default router;
