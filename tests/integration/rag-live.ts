/** Opt-in, disposable local database ONLY. Never uses .env database/provider URLs. */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { FunctionCallingConfigMode } from '@google/genai';
const url = new URL(process.env.RAG_EVALUATION_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/tradepro_rag_evaluation');
assert.equal(process.env.RAG_EVALUATION_APPROVED, 'true');
// Clear inherited credentials before dynamically importing application modules.
const env = parse(await readFile('.env'));
for (const key of Object.keys(process.env)) {
  if (/URL|SECRET|TOKEN|API_KEY/.test(key)) delete process.env[key];
}
process.env.DATABASE_URL = url.toString();
process.env.DIRECT_URL = url.toString();
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.NODE_ENV = 'development';
process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
process.env.GEMINI_MODEL = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const { default: prisma } = await import('../../src/db/db.config.js');
const { extractPdfText } = await import('../../src/modules/ai/rag/pdf.service.js');
const { ingestKnowledgeDocument } = await import('../../src/modules/ai/rag/ingestion.service.js');
const { publishKnowledgeDocument } = await import('../../src/modules/ai/rag/knowledge-publication.service.js');
const { searchKnowledge } = await import('../../src/modules/ai/rag/retrieval.service.js');
const { generateEmbedding } = await import('../../src/modules/ai/rag/embedding.service.js');
let report: Record<string, any> = { database: 'disposable localhost container', phases: {}, cases: [] };
try {
  let user: { id: string };
  if (process.env.RAG_EVALUATION_RESUME === 'true') {
    report = JSON.parse(await readFile('tests/fixtures/rag/live-results.json', 'utf8'));
    if (report.failure) { (report.previousFailures ??= []).push(report.failure); delete report.failure; }
    user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@rag-test.invalid' } });
  } else {
  assert.equal(await prisma.user.count(), 0, 'Requires a fresh disposable database');
  const admin = await prisma.user.create({ data: { email: 'admin@rag-test.invalid', passwordHash: 'disabled', role: 'ADMIN' } });
  user = await prisma.user.create({ data: { email: 'user@rag-test.invalid', passwordHash: 'disabled' } });
  await prisma.customer.create({ data: { userId: user.id, sid: 'RAG-DEV-ONLY', customerFirstName: 'Synthetic', customerLastName: 'Fixture', email: 'user@rag-test.invalid', customerNationality: 'TEST', phoneNumber: 'RAG-DEV-ONLY' } });
  const pdf = await extractPdfText('tests/fixtures/rag/observatory.pdf');
  assert.deepEqual(pdf.pages.map(p => p.pageNumber), [1, 2, 3]);
  report.phases.pdfExtraction = { pageCount: pdf.pageCount, passed: true };
  const fixture = await ingestKnowledgeDocument({ title: 'Lumen Observatory development fixture', slug: 'rag-dev-observatory', category: 'DEV_EVALUATION', pages: pdf.pages });
  report.phases.ingestion = fixture;
  await assert.rejects(publishKnowledgeDocument({ documentId: fixture.documentId, adminUserId: user.id }), /FORBIDDEN/);
  report.phases.publication = await publishKnowledgeDocument({ documentId: fixture.documentId, adminUserId: admin.id });
  const questions = JSON.parse(await readFile('tests/fixtures/rag/questions.json', 'utf8')) as Array<{ question: string; page: number | null; answer: string | null }>;
  for (const test of questions) {
    const vector = `[${(await generateEmbedding(test.question)).join(',')}]`;
    const ranked = await prisma.$queryRaw<Array<{ pageNumber: number; similarity: number }>>`
      SELECT "pageNumber", 1-(embedding <=> ${vector}::vector) AS similarity
      FROM "KnowledgeChunk" WHERE "documentId"=${fixture.documentId}::uuid ORDER BY embedding <=> ${vector}::vector`;
    const result = await searchKnowledge({ question: test.question, limit: 5 });
    report.cases.push({ ...test, ranked, retrievedPages: result.map(r => r.pageNumber), similarities: result.map(r => r.similarity), expectedPageRetrieved: test.page === null ? null : result.some(r => r.pageNumber === test.page), empty: result.length === 0 });
  }
  report.thresholds = [.5, .55, .6, .65, .7, .75, .8].map(threshold => ({ threshold,
    answerableRecall: report.cases.filter((c: any) => c.page !== null && c.ranked.some((r: any) => r.pageNumber === c.page && r.similarity >= threshold)).length / 12,
    unanswerableEmptyRate: report.cases.filter((c: any) => c.page === null && !c.ranked.some((r: any) => r.similarity >= threshold)).length / 4,
  }));
  // Identical synthetic chunk vectors make denied documents maximally competitive.
  const excluded: string[] = [];
  for (const [status, visibility, slug, category] of [
    ['DRAFT', 'PUBLIC', 'rag-dev-draft', 'DEV_EVALUATION'],
    ['PUBLISHED', 'INTERNAL', 'rag-dev-internal', 'DEV_EVALUATION'],
    ['ARCHIVED', 'PUBLIC', 'rag-dev-archived', 'DEV_EVALUATION'],
    ['DRAFT', 'INTERNAL', 'tradepro-ai-sample-knowledge-base', 'TRAINING'],
  ] as const) {
    const doc = await prisma.knowledgeDocument.create({ data: { title: 'Synthetic exclusion sentinel', slug, category, status, visibility } });
    excluded.push(doc.id);
    await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" (id,"documentId","chunkIndex",content,embedding,"embeddingModel","pageNumber") SELECT gen_random_uuid(),${doc.id}::uuid,"chunkIndex",content,embedding,"embeddingModel","pageNumber" FROM "KnowledgeChunk" WHERE "documentId"=${fixture.documentId}::uuid`;
  }
  await assert.rejects(publishKnowledgeDocument({ documentId: excluded[3]!, adminUserId: admin.id }), /TRAINING_DOCUMENT/);
  for (const test of questions) {
    const results = await searchKnowledge({ question: test.question });
    assert(results.every(r => r.documentId === fixture.documentId));
  }
  report.phases.exclusions = { passed: true, queries: questions.length, samplePublished: false };
  }
  process.env.STRIPE_SECRET_KEY = 'sk_test_disposable_not_a_real_key';
  const { getGeminiClient } = await import('../../src/config/gemini.js');
  const { AI_AUTHENTICATED_TOOL_DECLARATIONS } = await import('../../src/modules/ai/tools/index.js');
  report.tools = AI_AUTHENTICATED_TOOL_DECLARATIONS.map(t => t.name);
  report.autoRouting ??= [];
  for (const [question, expected] of [
    ['Search the approved knowledge base for the Lumen Observatory entrance code.', 'search_platform_knowledge'],
    ['What is my KYC status?', 'get_my_kyc_status'],
    ['List my trading accounts.', 'get_my_trading_accounts'],
    ['What are my account balances?', 'get_my_account_balances'],
    ['What is the current Bitcoin price?', 'get_market_price'],
    ['Show the latest market news.', 'get_latest_market_news'],
    ['Show my recent deposits and withdrawals.', 'get_my_fund_transactions'],
  ]) {
    if (report.autoRouting.some((r: any) => r.question === question)) continue;
    const response = await getGeminiClient().models.generateContent({ model: process.env.GEMINI_MODEL!, contents: question!, config: { tools: [{ functionDeclarations: AI_AUTHENTICATED_TOOL_DECLARATIONS }], toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } } } });
    const selected = response.functionCalls?.map(c => c.name) ?? [];
    report.autoRouting.push({ question, expected, selected, passed: selected.includes(expected) });
  }
  const { generateGroundedAnswer } = await import('../../src/modules/ai/rag/grounded-answer.service.js');
  report.grounded ??= [];
  for (const i of [1, 6, 9, 12, 14]) {
    const questions = JSON.parse(await readFile('tests/fixtures/rag/questions.json', 'utf8'));
    const test = questions[i]!;
    if (report.grounded.some((g: any) => g.question === test.question)) continue;
    try { report.grounded.push({ question: test.question, expectedPage: test.page, expectedAnswer: test.answer, result: await generateGroundedAnswer(test.question) }); }
    catch (error) { report.grounded.push({ question: test.question, failure: error instanceof Error ? error.message : 'Unknown error' }); }

  }
  const { executeAiTool } = await import('../../src/modules/ai/tools/tool-executor.js');
  report.privateTools = [];
  for (const name of ['get_my_kyc_status', 'get_my_trading_accounts', 'get_my_account_balances', 'get_my_fund_transactions']) {
    await assert.rejects(executeAiTool(name, {}), /AI_AUTH_REQUIRED/);
    report.privateTools.push({ name, result: await executeAiTool(name, {}, { userId: user.id }), unauthenticatedRejected: true });
  }
  const { generateAiResponseWithTools } = await import('../../src/modules/ai/ai-tool-selection.service.js');
  const { shouldRequireKnowledgeSearch } = await import('../../src/modules/ai/rag/rag-routing.service.js');
  report.applicationChat ??= [];
  for (const question of ['Search the approved knowledge base for the Lumen Observatory entrance code.', 'What are TradePro withdrawal fees?', 'For TradePro development documentation testing, search the approved knowledge base for the Meridian Workshop project code.']) {
    if (report.applicationChat.some((r: any) => r.question === question)) continue;
    try { report.applicationChat.push({ question, routing: shouldRequireKnowledgeSearch(question) ? 'ANY' : 'AUTO', result: await generateAiResponseWithTools(question, [], null, user.id) }); }
    catch (error) { report.applicationChat.push({ question, failure: error instanceof Error ? error.message : 'Unknown error' }); }
  }
  // Publish only a second version of the same reviewed fixture through the service.
  if (!report.phases.versionAndDuplicates) {
  const pdf = await extractPdfText('tests/fixtures/rag/observatory.pdf');
  const version2 = await ingestKnowledgeDocument({ title: 'Lumen Observatory development fixture', slug: 'rag-dev-observatory', category: 'DEV_EVALUATION', version: 2, pages: pdf.pages });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@rag-test.invalid' } });
  await publishKnowledgeDocument({ documentId: version2.documentId, adminUserId: admin.id });
  const older = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { slug_version: { slug: 'rag-dev-observatory', version: 1 } } });
  assert.equal(older.status, 'ARCHIVED');
  await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" (id,"documentId","chunkIndex",content,embedding,"embeddingModel","pageNumber") SELECT gen_random_uuid(),"documentId",100,content,embedding,"embeddingModel","pageNumber" FROM "KnowledgeChunk" WHERE "documentId"=${version2.documentId}::uuid AND "chunkIndex"=0`;
  const latest = await searchKnowledge({ question: 'What is the observatory entrance code?' });
  assert(latest.length > 0);
  assert(latest.every(r => r.version === 2 && r.documentId === version2.documentId));
  assert.equal(new Set(latest.map(r => r.content)).size, latest.length);
  report.phases.versionAndDuplicates = { passed: true, latestVersion: 2, oldVersion: older.status };
  }
  report.marketExecution = 'NOT RUN: no development Twelve Data/MarketAux/Redis configuration approved';
} catch (error) {
  // Error messages only; never serialize SDK request/config objects or credentials.
  report.failure = error instanceof Error ? error.message.replace(/AIza[\w-]+/g, '[REDACTED]') : 'Unknown error';
  process.exitCode = 1;
} finally {
  await writeFile('tests/fixtures/rag/live-results.json', JSON.stringify(report, null, 2) + '\n');
  await prisma.$disconnect();
  console.log('Integration report saved to tests/fixtures/rag/live-results.json');
}
