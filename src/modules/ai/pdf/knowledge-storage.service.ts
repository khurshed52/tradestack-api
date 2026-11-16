
import { randomUUID } from "node:crypto";
import {
  mkdir,
  copyFile,
  unlink,
  stat,
  open,
} from "node:fs/promises";
import path from "node:path";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const STORAGE_ROOT = path.resolve(
  process.env.KNOWLEDGE_STORAGE_DIR ??
    "storage/knowledge-documents",
);

export interface StoreKnowledgePdfInput {
  sourceFilePath: string;
  slug: string;
  version: number;
}

export interface StoredKnowledgePdf {
  storagePath: string;
}

/**
 * Save the original PDF in private storage.
 *
 * The document is stored under its slug and version,
 * with a generated filename to avoid collisions.
 */
export async function storeKnowledgePdf(
  input: StoreKnowledgePdfInput,
): Promise<StoredKnowledgePdf> {
  const { sourceFilePath, slug, version } = input;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("INVALID_DOCUMENT_SLUG");
  }

  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("INVALID_DOCUMENT_VERSION");
  }

  const sourceStats = await stat(sourceFilePath);

  if (
    !sourceStats.isFile() ||
    sourceStats.size === 0 ||
    sourceStats.size > MAX_PDF_BYTES
  ) {
    throw new Error("INVALID_PDF_FILE");
  }

  // Validate the PDF signature before storing.
  const handle = await open(sourceFilePath, "r");

  try {
    const signature = Buffer.alloc(5);
    const { bytesRead } = await handle.read(
      signature,
      0,
      signature.length,
      0,
    );

    if (
      bytesRead !== 5 ||
      signature.toString("ascii") !== "%PDF-"
    ) {
      throw new Error("INVALID_PDF_FILE");
    }
  } finally {
    await handle.close();
  }

  const directory = path.join(
    STORAGE_ROOT,
    slug,
  );

  await mkdir(directory, {
    recursive: true,
    mode: 0o700,
  });

  const filename = `v${version}-${randomUUID()}.pdf`;
  const destination = path.join(directory, filename);

  // COPYFILE_EXCL prevents overwriting an existing file.
  await copyFile(
    sourceFilePath,
    destination,
    1,
  );

  return {
    storagePath: destination,
  };
}

/**
 * Remove a stored PDF when its ingestion fails.
 * Never use this to delete an already published
 * document's PDF without an explicit admin workflow.
 */
export async function removeStoredKnowledgePdf(
  storagePath: string,
): Promise<void> {
  const resolvedPath = path.resolve(storagePath);

  if (
    !resolvedPath.startsWith(
      STORAGE_ROOT + path.sep,
    )
  ) {
    throw new Error("INVALID_STORAGE_PATH");
  }

  await unlink(resolvedPath);
}
