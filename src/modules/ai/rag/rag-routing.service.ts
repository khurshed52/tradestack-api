
const KNOWLEDGE_PATTERNS = [
  /\b(?:deposit|withdrawal|transfer|kyc|verification)\b.*\b(?:fees?|limits?|how long|documents?|requirements?)\b/i,
  /\b(?:fees?|limits?|how long|documents?|requirements?)\b.*\b(?:deposit|withdrawal|transfer|kyc|verification)\b/i,
  /\baccording to (the )?(tradepro )?(documentation|knowledge base|guide|policy|pdf)\b/i,
  /\btradepro.*\b(document|documentation|guide|policy|procedure|reference)\b/i,
  /\bhow (do|can|should) i\b.*\b(verify|verification|kyc|deposit|withdraw|transfer)\b/i,
  /\b(kyc|verification|deposit|withdrawal|transfer)\b.*\b(process|procedure|policy|steps|requirements|instructions)\b/i,
  /\brag integration test\b/i,
];

const PERSONAL_DATA_PATTERNS = [
  /\b(my|mine)\b.*\b(balance|balances|transaction|transactions|kyc status|verification status|account status)\b/i,
  /\b(show|check|fetch|view)\b.*\b(my|mine)\b.*\b(accounts?|balances?|transactions?|kyc status)\b/i,
];

export function shouldRequireKnowledgeSearch(
  message: string,
): boolean {
  const text = message.trim();

  if (!text) return false;

  const asksForPersonalData = PERSONAL_DATA_PATTERNS.some(
    (pattern) => pattern.test(text),
  );

  const asksForDocumentation = KNOWLEDGE_PATTERNS.some(
    (pattern) => pattern.test(text),
  );

  // Mixed questions can require both private tools
  // and general documentation. Don't force a single
  // tool when personal account data is requested.
  if (asksForPersonalData) return false;

  return asksForDocumentation;
}
