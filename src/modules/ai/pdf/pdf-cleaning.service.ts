
export function cleanPdfPageText(text: string): string {
  if (!text.trim()) return "";

  return text
    // Normalize line endings.
    .replace(/\r\n?/g, "\n")

    // Remove this sample PDF's repeated page header.
    // Handles PDF.js splitting "v0.1" across lines.
    .replace(
      /^TradePro AI\s*\|\s*SAMPLE\s*-\s*TRAINING ONLY\s*\|\s*DRAFT\s+v0\.\s*1\s+Page\s+\d+\s*/i,
      "",
    )

    // Normalize horizontal whitespace.
    .replace(/[ \t]+/g, " ")

    // Remove excessive blank lines.
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}
