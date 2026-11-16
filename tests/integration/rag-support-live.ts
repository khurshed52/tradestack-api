/** Full orchestration evaluation. Opt-in disposable localhost database only. */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
const url = new URL(process.env.RAG_EVALUATION_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/tradepro_rag_support_evaluation');
assert.equal(process.env.RAG_EVALUATION_APPROVED, 'true');
const env = parse(await readFile('.env'));
for (const key of Object.keys(process.env)) if (/URL|SECRET|TOKEN|API_KEY/.test(key)) delete process.env[key];
Object.assign(process.env, { DATABASE_URL: url.href, DIRECT_URL: url.href, DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'development', GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_MODEL: env.GEMINI_MODEL ?? 'gemini-2.5-flash', STRIPE_SECRET_KEY: 'sk_test_disposable_dummy' });
const { default: prisma } = await import('../../src/db/db.config.js');
const { extractPdfText } = await import('../../src/modules/ai/rag/pdf.service.js');
const { ingestKnowledgeDocument } = await import('../../src/modules/ai/rag/ingestion.service.js');
const { publishKnowledgeDocument } = await import('../../src/modules/ai/rag/knowledge-publication.service.js');
const { searchKnowledge } = await import('../../src/modules/ai/rag/retrieval.service.js');
const { generateEmbedding } = await import('../../src/modules/ai/rag/embedding.service.js');
const { generateAiResponseWithTools } = await import('../../src/modules/ai/ai-tool-selection.service.js');
const { getGeminiClient } = await import('../../src/config/gemini.js');
const root = 'tests/fixtures/rag-support';
const output = `${root}/results.json`;
let report: any = { startedAt: new Date().toISOString(), model: process.env.GEMINI_MODEL, embeddingModel: 'gemini-embedding-2', dimensions: 768, database: 'disposable localhost, synthetic users only', cases: [] };
const safeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/AIza[\w-]+/g, '[REDACTED]');
const save = () => writeFile(output, JSON.stringify(report, null, 2)+'\n');
// Passive instrumentation: no prompt, response, routing or tool changes.
const client = getGeminiClient();
const originalGenerate = client.models.generateContent.bind(client.models);
let activeTrace: any[] | null = null;
client.models.generateContent = async (params) => {
  const started = performance.now();
  const contents: any = params.contents;
  const evidence = (Array.isArray(contents) ? contents : []).flatMap((c: any) => c.parts ?? []).filter((p: any) => p.functionResponse).map((p: any) => p.functionResponse);
  const entry: any = { mode: params.config?.toolConfig?.functionCallingConfig?.mode ?? 'unspecified', toolResponses: JSON.parse(JSON.stringify(evidence)) };
  activeTrace?.push(entry);
  try {
    const response = await originalGenerate(params);
    entry.functionCalls = response.functionCalls ?? [];
    return response;
  } catch(e) { entry.error = safeError(e); throw e; }
  finally { entry.latencyMs = Math.round(performance.now()-started); }
};
try {
  if (process.env.RAG_EVALUATION_RETRY === 'true') {
    report = JSON.parse(await readFile(output, 'utf8'));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@support-eval.invalid' } });
    for (const entry of report.cases.filter((c: any) => c.chatError && !c.recovery)) {
      const recovery: any = { trace: [] };
      entry.recovery = recovery;
      activeTrace = recovery.trace;
      await new Promise(resolve => setTimeout(resolve, 5000));
      const began = performance.now();
      try { recovery.chat = await generateAiResponseWithTools(entry.question, [], null, user.id); }
      catch(e) { recovery.chatError = safeError(e); }
      finally { recovery.chatMs = Math.round(performance.now()-began); activeTrace = null; }
      await save();
    }
  } else {
  assert.equal(await prisma.user.count(), 0, 'Fresh disposable database required');
  const admin = await prisma.user.create({ data: { email: 'admin@support-eval.invalid', passwordHash: 'disabled', role: 'ADMIN' } });
  const user = await prisma.user.create({ data: { email: 'user@support-eval.invalid', passwordHash: 'disabled' } });
  await prisma.customer.create({ data: { userId: user.id, sid: 'SUPPORT-EVAL', customerFirstName: 'Synthetic', customerLastName: 'Customer', email: user.email, customerNationality: 'TEST', phoneNumber: 'SUPPORT-EVAL', status: 'REGISTERED' } });
  const pdf = await extractPdfText(`${root}/support-demo.pdf`);
  assert.deepEqual(pdf.pages.map(p=>p.pageNumber), [1,2,3,4]);
  report.extractedPages = pdf.pages;
  const start = performance.now();
  const doc = await ingestKnowledgeDocument({ title: 'TradePro Demo Support - Development Fixture', slug: 'tradepro-support-dev-fixture', category: 'DEV_EVALUATION', version: 1, pages: pdf.pages });
  await assert.rejects(publishKnowledgeDocument({ documentId: doc.documentId, adminUserId: user.id }), /FORBIDDEN/);
  report.publication = await publishKnowledgeDocument({ documentId: doc.documentId, adminUserId: admin.id });
  report.ingestionPublicationMs = Math.round(performance.now()-start);
  const questions = JSON.parse(await readFile(`${root}/questions.json`, 'utf8'));
  for(const test of questions) {
    const entry: any = { ...test, trace: [] };
    report.cases.push(entry);
    let began = performance.now();
    try {
      const vector = `[${(await generateEmbedding(test.question)).join(',')}]`;
      entry.ranked = await prisma.$queryRaw`SELECT "pageNumber",content,1-(embedding <=> ${vector}::vector) AS similarity FROM "KnowledgeChunk" WHERE "documentId"=${doc.documentId}::uuid ORDER BY embedding <=> ${vector}::vector`;
      entry.retrieval = await searchKnowledge({ question: test.question, limit: 5 });
      assert(entry.retrieval.every((r: any)=>r.documentId===doc.documentId && r.version===1));
      entry.retrievalMs = Math.round(performance.now()-began);
    } catch(e) { entry.retrievalError = safeError(e); }
    activeTrace = entry.trace;
    began = performance.now();
    try { entry.chat = await generateAiResponseWithTools(test.question, [], null, user.id); }
    catch(e) { entry.chatError = safeError(e); }
    finally { entry.chatMs = Math.round(performance.now()-began); activeTrace = null; }
    entry.toolSelectionPass = !!entry.chat && test.expectedTools.every((t: string)=>entry.chat.toolsCalled.includes(t));
    entry.initialMode = entry.trace[0]?.mode ?? null;
    await save();
    console.log(`CASE ${test.id}: ${entry.initialMode}, chat ${entry.chatError ? 'ERROR' : 'completed'}, ${entry.chatMs}ms`);
  }
  report.thresholds = [.55,.6,.625,.65,.675,.7,.75].map(threshold=>({ threshold,
    answerableRecall: report.cases.filter((c:any)=>c.page!==null && c.ranked?.some((r:any)=>r.pageNumber===c.page && r.similarity>=threshold)).length / 15,
    unsupportedEmptyRate: report.cases.filter((c:any)=>c.page===null && c.ranked && !c.ranked.some((r:any)=>r.similarity>=threshold)).length / 3,
  }));
  }
} catch(e) { report.infrastructureFailure=safeError(e); process.exitCode=1; }
finally { if (process.env.RAG_EVALUATION_RETRY === 'true') report.retryFinishedAt=new Date().toISOString(); else report.finishedAt=new Date().toISOString(); await save(); await prisma.$disconnect(); }
