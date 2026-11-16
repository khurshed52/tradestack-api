# Stage 3 final verification — 16 November 2026

## Verdict: Needs fixes

The isolated integration path works, but answer grounding is not consistently production-ready. Do not interpret successful HTTP/SSE completion as a grounded-answer pass. Stage 4 design can begin; production autonomous agents should wait.

## Scope and safety

Used only disposable PostgreSQL/pgvector and Redis containers, synthetic users, the reviewed synthetic practice PDF, and separate Express servers. Final database: `rag_e2e_1794820276100_c933ca`, host `127.0.0.1:63496`; backend port `63499`. Programmatic database verification preceded migrations. Existing database `localhost:5432/trading` and server port 3001 were not accessed. Existing migrations ran only in disposable databases. No deployment or commit.

All three runs record cleanup in their `run.json`: containers and temporary credentials removed, spawned server exited. Final container removal was independently checked with Docker. The training PDF was not published.

## Changes made in this task

Production files:

- `src/config/gemini.ts`: SDK request timeout.
- `src/modules/ai/ai-tool-selection.service.ts`: cancellation and bounded retries; retry stream opening without replaying consumed streams; truncated structured-answer recovery; safe diagnostics and request/duration metrics; no-evidence shortcut; conservative final reply when attribution has no verified source.
- `src/modules/ai/tools/tool-executor.ts`: cancellation propagated through tool timeout handling.
- `src/modules/ai/tools/rag.tools.ts`: cancellation forwarded to retrieval.
- `src/modules/ai/rag/embedding.service.ts`: embedding cancellation.
- `src/modules/ai/rag/retrieval.service.ts`: customer retrieval always excludes training content, including when the development bypass flag is set; cancellation checks.
- New `src/modules/ai/rag/answer-evidence.ts`: strict attribution parsing, rejecting malformed/truncated JSON instead of salvaging unverified IDs.

Tests: added `aiStage3.test.ts`, `aiSseController.test.ts`, `aiToolCancellation.test.ts` under `src/scripts`; updated `ragHardening.test.ts` and `knowledgePublication.test.ts`. Added isolated runner, server instrumentation, evaluator and metrics scripts under `tests/integration/rag-stage3-*`, and evidence/report files in this directory. Other pre-existing working-tree changes are not attributed to this task.

No route, response-field, Prisma-schema, authentication or conversation persistence redesign. Existing tool validation, ownership checks and tool budgets remain.

## Audit

Existing optimizations include hybrid semantic/keyword retrieval, latest-public-version filtering, streamed structured reply decoding, and separate citation attribution. Normal supported RAG requests still use approximately four generation requests; skipping generation when retrieval has no evidence reduces work for that branch. SSE chunks are emitted before attribution and persistence; the final `done` event follows persistence. Automated tests cover this order.

SQL/vector queries use parameterized values. Customer tools use authenticated context rather than model-supplied user IDs. Existing limits remain three calls per round, three rounds and six total calls. Cancellation now stops further model/tool work, though an already-issued database query may finish.

## Tests and live outcomes

- TypeScript: passed `npx tsc --noEmit`.
- Vitest: **69/69**, seven files; mocked/unit integration tests, not live service tests.
- Node test runner: **16/16**, existing market, reliability and authenticated KYC tests with mocked services.
- Real final Gemini/pgvector/SSE run: **15/16 completed**. One real mid-stream Gemini 503 returned a generic error. No automatic mid-stream replay.
- Six requested questions, twice: 11/12 completed. Unsupported lunar rebate rejected twice. KYC/deposit/withdrawal queries mostly returned the conservative no-evidence response because fictional documents cannot establish real policies.
- Four supplemental synthetic questions: correct deposit navigation and transfer reference in all four; structured citation metadata correctly references current document version 2 and pages 2/4.
- **Grounding failure:** delayed-withdrawal answer in round two generalized fictional navigation into real-user advice without the synthetic qualification. Treat this as a failed grounding check.
- **Citation prose failure:** final transfer answer said “Version 1” while structured citation metadata correctly said version 2. The PDF bytes deliberately still contain a version-1 header; metadata filtering passed, but conflicting text/metadata handling did not.
- Live customer retrieval returned only latest PUBLISHED/PUBLIC version 2; previous version archived and DRAFT/INTERNAL/ARCHIVED/training sentinels excluded.
- Authentication 401; cross-user conversation read and continuation 404; disconnect saved zero assistant messages; actual global IP rate limit returned 429. This does not establish distributed rate-limit behavior or separately exercise the production AI-specific limiter.
- All 15 completed final responses persisted. Baseline persistence flags were affected by a harness lowercase/uppercase enum comparison, corrected before final evaluation.
- Prompt-injection canary was not repeated in either supplemental adversarial answer. This is limited evidence, not a comprehensive injection-proof claim.

## Performance

Medians across successful runs of the six requested questions, two repetitions each; failed calls excluded, separately recorded. Model: `gemini-3.5-flash-lite`. No artificial delay inside measured requests.

| Metric | Before | Final after |
|---|---:|---:|
| First nonempty answer chunk | 4,182 ms | 4,506 ms |
| Total stream duration | 4,938 ms | 5,561 ms |
| Generation requests | 4 | 4 |
| Retrieval duration | 576 ms | 502 ms |
| Attribution duration | 832 ms | 885 ms |
| Input tokens | 9,410 | 9,513 |
| Output tokens | 151 | 117 |
| Total tokens | 9,580 | 9,648 |

**No demonstrated latency improvement.** Small samples and provider errors prevent strong performance conclusions. Baseline retrieval uses tool-round timing; after instrumentation also records retrieval duration directly. Counts exclude embeddings; failed stream-open calls may be missing from instrumentation. Usage is not a complete billing ledger.

Baseline: one 503; intermediate run: one transport timeout; final run: one mid-stream 503. The final transport-error retry addition was unit-tested after the benchmark server loaded; its recovery branch was not live-validated. The normal generation path was measured.

## Remaining production risks

1. Provisional streamed text can contain unsupported statements before the final citation guard replaces the persisted/done reply. Frontend reconciliation has not been verified. Do not claim all visible chunks are grounded.
2. Attribution remains model judgement; the observed synthetic-to-real generalization and conflicting prose version require targeted follow-up. No hardcoded customer policy fixes were added.
3. Actual approved TradePro policies/payment methods were not tested. Fictional fixtures cannot certify production knowledge coverage.
4. Mid-stream provider outages still fail safely rather than resume. Retry/deadline bounds cannot guarantee availability.
5. Large-corpus/load performance, ANN/full-text indexing and distributed rate limiting remain unverified. Current in-memory rate limiting is per process.
6. Embedding usage, failed/aborted billing and monetary cost accounting are not complete. Never infer cost from returned successful token counts alone.

## Stage 4 recommendation

Reuse the authenticated tool executor, strict schemas, function-response observations, RAG, conversation storage, SSE, cancellation and budgets. Later add an explicit goal/completion contract and bounded plan/act/observe/replan runner with durable checkpoints, per-run time/token/step budgets and audited capability policy. Start with read-only tools. Any future sensitive operation needs human approval bound to the exact operation and user, plus idempotency; no financial action tools were added here.

First resolve streaming-grounding and citation consistency, then validate an approved real policy corpus in an authorized isolated environment. Ready for Stage 4 architecture discussions; **not ready to declare Stage 3 complete or enable production autonomous actions**.

Reproduction commands and measurement caveats: `README.md`. Exact responses and traces: `before/`, `after-first/`, `after/`; aggregate medians: `metrics.json`.
