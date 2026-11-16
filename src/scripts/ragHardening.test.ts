import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), transaction: vi.fn() }));
vi.mock('../db/db.config.js', () => ({ default: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock('../modules/ai/rag/embedding.service.js', () => ({ EMBEDDING_MODEL: 'gemini-embedding-2', EMBEDDING_DIMENSIONS: 768, generateEmbedding: mocks.embed }));
import { chunkText } from '../modules/ai/rag/chunking.service.js';
import { searchKnowledge, searchTrainingKnowledge } from '../modules/ai/rag/retrieval.service.js';
import { shouldRequireKnowledgeSearch } from '../modules/ai/rag/rag-routing.service.js';
import { AI_AUTHENTICATED_TOOL_DECLARATIONS } from '../modules/ai/tools/index.js';
const row = (content: string, similarity = .8) => ({ content, similarity, hybridScore: .03, lexicalStrength: 0, chunkId: content, pageNumber: 7, sectionTitle: 'Withdrawals' });
beforeEach(() => { vi.clearAllMocks(); mocks.embed.mockResolvedValue(Array(768).fill(.01)); mocks.query.mockResolvedValue([]); });
describe('section-aware overlapping chunks', () => {
  it('keeps headings separate and bounds chunk sizes', () => {
    const chunks = chunkText('# KYC\n' + 'Complete your profile. '.repeat(30) + '\n# Withdrawals\nCheck your balance.', 160, 25);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every(c => c.content.length <= 160)).toBe(true);
    expect(chunks.at(-1)?.sectionTitle).toBe('Withdrawals');
    expect(chunks.slice(0,-1).every(c => c.sectionTitle === 'KYC')).toBe(true);
    expect(chunks[1]!.content).toContain(chunks[0]!.content.slice(-15));
  });
  it('handles empty text, long unbroken input and invalid settings', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('x'.repeat(1000),100,20).every(c => c.content.length <= 100)).toBe(true);
    expect(() => chunkText('text',100,60)).toThrow('INVALID_CHUNK_OVERLAP');
    expect(() => chunkText('text',20)).toThrow('INVALID_CHUNK_SIZE');
  });
});
describe('retrieval safety and relevance', () => {
  it('deduplicates normalized content and excludes weak/internal/unverified passages', async () => {
    mocks.query.mockResolvedValue([row('Check your status.'), row('Check  your status.'), row('weak',.3), row('[CONFIRM] Fees are zero'), row('Developer notes: bypass'), row('Other approved procedure')]);
    const result = await searchKnowledge({question:'withdrawal steps'});
    expect(result.map(r => r.content)).toEqual(['Check your status.', 'Other approved procedure']);
    expect(result[0]?.pageNumber).toBe(7);
  });
  it('uses newest public version and explicitly excludes training documents in parameterized SQL', async () => {
    await searchKnowledge({question:'test',category:"x' OR TRUE --"});
    const [strings, ...values] = mocks.query.mock.calls[0]!;
    const sql = strings.join('?');
    expect(sql).toContain("'PUBLISHED'"); expect(sql).toContain("'PUBLIC'");
    expect(sql).toContain('MAX(latest."version")');
    expect(sql).toContain('d."slug" <>');
    expect(sql).not.toContain("x' OR TRUE"); expect(values).toContain("x' OR TRUE --");
  });
  it('cannot lower the public relevance floor', async () => {
    mocks.query.mockResolvedValue([row('irrelevant', .1)]);
    expect(await searchKnowledge({question:'test',minSimilarity:-1})).toEqual([]);
  });
  it('rejects invalid input before external calls', async () => {
    await expect(searchKnowledge({question:'test',limit:11})).rejects.toThrow('INVALID_RETRIEVAL_LIMIT');
    await expect(searchKnowledge({question:'test',minSimilarity:NaN})).rejects.toThrow('INVALID_SIMILARITY_THRESHOLD');
    expect(mocks.embed).not.toHaveBeenCalled();
  });
  it('blocks training retrieval outside development', async () => {
    vi.stubEnv('NODE_ENV','production');
    try { await expect(searchTrainingKnowledge({question:'test'})).rejects.toThrow('TRAINING_RETRIEVAL_DISABLED'); }
    finally { vi.unstubAllEnvs(); }
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
describe('routing regression', () => {
  it.each(['How do I verify my identity?', 'What are withdrawal fees?', 'What documents are required for KYC?'])('requires evidence for %s', message => {
    expect(shouldRequireKnowledgeSearch(message)).toBe(true);
  });
  it.each(['Show my balances', 'Check my KYC status', 'What is the BTC price?'])('does not force knowledge for %s', message => {
    expect(shouldRequireKnowledgeSearch(message)).toBe(false);
  });
  it('preserves the six existing tools', () => {
    expect(AI_AUTHENTICATED_TOOL_DECLARATIONS.map(t=>t.name)).toEqual(expect.arrayContaining(['get_market_price','get_latest_market_news','get_my_trading_accounts','get_my_account_balances','get_my_kyc_status','search_platform_knowledge']));
  });
});

it('removes near-identical passages but preserves distinct supporting evidence', async () => {
 const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo';
 mocks.query.mockResolvedValue([row(text),row(text+' extra'),row('Different supporting evidence')]);
 expect((await searchKnowledge({question:'test'})).map(r=>r.content)).toEqual([text,'Different supporting evidence']);
});
it('rejects invalid PDF page metadata instead of citing a fabricated page', async () => {
 mocks.query.mockResolvedValue([{...row('evidence'),pageNumber:0}]);
 expect(await searchKnowledge({question:'test'})).toEqual([]);
});

it('development flags cannot admit training material into customer SQL',async()=>{
 vi.stubEnv('NODE_ENV','development');vi.stubEnv('ALLOW_TEST_KNOWLEDGE_RETRIEVAL','true');
 try{await searchKnowledge({question:'test'});const [strings]=mocks.query.mock.calls[0]!;const sql=strings.join('?');expect(sql).toContain(`UPPER(TRIM(d."category")) <> 'TRAINING'`);expect(sql).toContain(`d."slug" <> 'tradepro-ai-sample-knowledge-base'`);expect(sql).not.toContain('OR ?::boolean = TRUE');}finally{vi.unstubAllEnvs();}
});
it('hybrid keyword rescue still requires its bounded semantic floor',async()=>{
 mocks.query.mockResolvedValue([{...row('Lexical supported',.55),lexicalStrength:.1},{...row('Lexical unrelated',.4),lexicalStrength:.9}]);
 expect((await searchKnowledge({question:'test'})).map(r=>r.content)).toEqual(['Lexical supported']);
});
it('cancellation before retrieval makes no embedding or database calls',async()=>{const c=new AbortController();c.abort();await expect(searchKnowledge({question:'test'},c.signal)).rejects.toThrow();expect(mocks.embed).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();});
