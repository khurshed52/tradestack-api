
import { readFile, stat } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { cleanPdfPageText } from "./pdf-cleaning.service.js";
export interface ExtractedPdfPage {
  pageNumber: number;
  content: string;
}

export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPdfPage[];
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

export async function extractPdfText(
  filePath: string,
): Promise<ExtractedPdf> {
  const fileStats = await stat(filePath);

  if (
    !fileStats.isFile() ||
    fileStats.size === 0 ||
    fileStats.size > MAX_PDF_BYTES
  ) {
    throw new Error("INVALID_PDF_FILE");
  }

  const fileBuffer = await readFile(filePath);

  // PDF.js accepts a Uint8Array containing the PDF bytes.
  const loadingTask = getDocument({
    data: new Uint8Array(fileBuffer),
    useSystemFonts: true,
  });

  try {
    const pdf = await loadingTask.promise;

    if (
      pdf.numPages === 0 ||
      pdf.numPages > MAX_PDF_PAGES
    ) {
      throw new Error("INVALID_PDF_PAGE_COUNT");
    }

    const pages: ExtractedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();

      const parts: string[] = [];

      for (const item of textContent.items) {
        if (!("str" in item)) continue;

        const text = item.str.trim();
        if (!text) continue;

        parts.push(text + (item.hasEOL ? "\n" : " "));
      }

      const content = cleanPdfPageText(
        parts
            .join("")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/[ \t]{2,}/g, " "),
        );

      pages.push({
        pageNumber,
        content,
      });

      page.cleanup();
    }

    if (pages.every((page) => !page.content)) {
      throw new Error("PDF_HAS_NO_EXTRACTABLE_TEXT");
    }

    return {
      pageCount: pdf.numPages,
      pages,
    };
  } finally {
    await loadingTask.destroy();
  }
}
