import { z } from "zod";

const evidenceSchema = z.object({ chunkIds: z.array(z.string()).max(50) }).strict();

/** Accept complete JSON (optionally fenced), never guess IDs from truncated output. */
export function parseAnswerEvidence(raw: string | undefined): string[] {
  const text = raw?.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1").trim();
  if (!text) return [];
  try {
    const parsed = evidenceSchema.safeParse(JSON.parse(text));
    return parsed.success ? [...new Set(parsed.data.chunkIds)] : [];
  } catch {
    return [];
  }
}

// A source nomination alone does not establish that every policy claim is supported.
export const verifiedEvidenceSchema = z.object({
  chunkIds: z.array(z.string()).max(50),
  supported: z.boolean(),
}).strict();

export function parseVerifiedEvidence(raw: string | undefined) {
  try {
    const text = raw?.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1").trim();
    const result = verifiedEvidenceSchema.safeParse(JSON.parse(text ?? ""));
    return result.success ? result.data : null;
  } catch { return null; }
}

/** Extra deterministic checks; metadata is authoritative, PDF headers are not. */
export function evidenceMatchesReply(
  reply: string,
  sources: Array<{ version: number; content: string }>,
): boolean {
  const versions = [...reply.matchAll(/\bversion\s+(\d+)\b/gi)].map(match => Number(match[1]));
  if (versions.some(version => !sources.some(source => source.version === version))) return false;
  const synthetic = /\b(synthetic|fictional|development.only|not real.{0,30}polic)\b/i;
  if (sources.some(source => synthetic.test(source.content)) && !synthetic.test(reply)) return false;
  return true;
}
