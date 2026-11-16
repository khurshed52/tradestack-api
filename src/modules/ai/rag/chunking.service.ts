export interface TextChunk {
  chunkIndex: number;
  content: string;
  sectionTitle: string | null;
}

// Conservative heading detection: Markdown, numbered sections, or short
// uppercase headings. Ordinary prose is never promoted based on length alone.
export function chunkText(text: string, maxChars = 1200, overlapChars = Math.min(160, Math.floor(maxChars / 5))): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 100) throw new Error("INVALID_CHUNK_SIZE");
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars / 2) throw new Error("INVALID_CHUNK_OVERLAP");
  const sections: Array<{ title: string | null; lines: string[] }> = [];
  let section: { title: string | null; lines: string[] } = { title: null, lines: [] };
  for (const line of text.replace(/\r\n?/g, '\n').trim().split('\n')) {
    const value = line.trim();
    const heading = /^(?:#{1,6}\s+|\d+(?:\.\d+)*[.)]?\s+)[A-Za-z]/.test(value) || /^[A-Z][A-Z &/-]{3,79}$/.test(value);
    if (heading && value.length <= 120) {
      if (section.lines.length) sections.push(section);
      section = { title: value.replace(/^#{1,6}\s+/, ''), lines: [value] };
    } else section.lines.push(line);
  }
  sections.push(section);
  const chunks: TextChunk[] = [];
  for (const part of sections) {
    const content = part.lines.join('\n').trim();
    let start = 0;
    while (start < content.length) {
      let end = Math.min(start + maxChars, content.length);
      if (end < content.length) {
        const window = content.slice(start, end);
        const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. ') + 1, window.lastIndexOf(' '));
        if (boundary > maxChars / 2) end = start + boundary;
      }
      const value = content.slice(start, end).trim();
      if (value) chunks.push({ chunkIndex: chunks.length, content: value, sectionTitle: part.title });
      if (end === content.length) break;
      start = end - overlapChars;
    }
  }
  return chunks;
}
