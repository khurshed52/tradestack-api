# Targeted Stage 3 follow-up — 16 November 2026

## Verdict: Needs fixes / production acceptance

The confirmed streaming inconsistency and citation-version regressions are fixed in the tested paths. Overall Stage 3 is not signed off: provider failures, increased latency and untested approved real-policy coverage remain. No agent functionality was introduced.

## Exact production changes

1. `src/modules/ai/ai-tool-selection.service.ts`
   - Hold knowledge-answer deltas until verification finishes, including mixed private-tool/RAG requests. Emit only the final verified reply or safe fallback using the existing `chunk` event. Non-RAG generation continues streaming immediately.
   - Reuse the existing attribution request to check **all policy/procedure claims**, rather than merely selecting sources supporting some claims. Require a valid `supported: true` verdict and known retrieved chunk IDs. Fail closed on malformed output, unsupported claims, verification failure or fabricated IDs.
   - Supply authoritative document version and page metadata to that verifier. Tell answer generation to leave citation labels to structured metadata, never trust embedded PDF headers, and retain fictional/synthetic qualifications.
   - Preserve cancellation checks before and after releasing the held answer. The existing controller persists that same final reply and returns it in `done.data.reply`.
2. `src/modules/ai/rag/answer-evidence.ts`
   - Strict verification parser and schema.
   - Additional deterministic rejection of prose version numbers inconsistent with cited metadata and synthetic passages generalized into unqualified real policy. This supplements semantic verification; it is not a general natural-language proof system.

No routes, response fields, database schema, retrieval thresholds, embedding model/dimensions, authentication or tool authorization changed. No frontend files changed.

### Frontend inspection and testing

The accessible frontend is `/Users/khurshedkhan/Desktop/ai-trading-frontend`.

- `services/tradepro-ai.service.ts`, `getStreamResult` (around line 618): nonempty final `data.reply` takes precedence over accumulated chunks.
- `hooks/useTradeProAiChat.ts` (around lines 437–484): provisional chunks append during generation; completion replaces message content with `result.reply` and attaches final source metadata.
- Executed a read-only contract test loading the actual frontend service with mocked fetch: final reply replacement, incomplete-stream rejection and cancellation propagation all passed. No Next.js server or browser UI was launched; hook reconciliation was inspected, not browser-tested.

Backend withholding means the customer need not wait for frontend correction to hide unsupported **RAG** drafts. RAG first-answer streaming necessarily waits for verification; existing status events and immediate non-RAG streaming remain. Mixed answers fail closed as a whole if their policy component fails verification; private tools still execute under existing authorization, but an independently safe private portion is not salvaged from an unsafe combined draft.

## Files changed or created

Production files: the two files above.

Tests changed: `src/scripts/aiStage3.test.ts`, `src/scripts/aiSseController.test.ts`.

Harness changed: `tests/integration/rag-stage3-run.mjs`, `rag-stage3-evaluate.ts`, `rag-stage3-server.ts`.

Harness added: `tests/integration/rag-stage3-fix-metrics.mjs`, `rag-frontend-contract.mjs`.

Evidence/docs: updated this directory's `README.md`; added `FIX-REPORT.md`, `fix-metrics.json`, and `after-fix/` results, traces, redacted environment and cleanup logs. Original `after/` evidence preserved as the pre-fix baseline. Other pre-existing working-tree changes are not part of this task.

## Automated results

- `npx tsc --noEmit`: passed.
- Explicit TypeScript check of the isolated evaluator/server: passed.
- Relevant Vitest suite: **76/76** across seven files.
- Existing Node tests for market tools, reliability and authenticated KYC: **16/16**.
- Actual frontend service with mocked HTTP: **3/3** checks.

Regression coverage includes withheld unsupported drafts, partial-support rejection, malformed verification JSON, unknown citation IDs, embedded version conflicts, unqualified fictional-policy claims, no evidence, cancellation during verification, final reply persistence and mixed private/RAG policy bypass. Non-RAG streaming and existing retry/authorization/budget tests remain green. These automated checks use mocks; live results are separate below.

## Real isolated results

Real Gemini `gemini-3.5-flash-lite`, PostgreSQL/pgvector retrieval, real Express SSE and persistence, two repetitions of the six requested questions plus two supplemental synthetic/adversarial questions:

- **15/16 completed**; one transfer attempt failed during a Gemini answer stream with 503. It emitted no unverified answer and returned a generic error.
- **15/15** completed replies: concatenated chunks = final reply = persisted assistant text.
- **12/12** ordinary procedure/unsupported-question requests returned a safe no-evidence answer. The corpus is fictional and cannot establish actual TradePro policies. This is not proof of real-policy answer coverage.
- **3/3** completed explicitly synthetic questions were grounded, preserved the synthetic qualification and cited authoritative version 2. Deposit pages: 2; transfer page: 4. The transfer reference was correct; no malicious canary or stale version-1 prose was emitted. The fourth attempt is the provider failure above.
- Latest PUBLIC/PUBLISHED version filtering passed; previous version archived; DRAFT/INTERNAL/ARCHIVED and training sentinels excluded.
- Unauthenticated 401; cross-user conversation read/continue 404; cancellation produced zero assistant messages; global IP limiter returned 429. Production distributed/AI-specific limiting is not established by this test.

The pre-fix baseline had an unqualified fictional withdrawal procedure and stale version-1 prose. Neither occurred in the follow-up completed cases. Version conflict tests also explicitly force a wrong model verdict and verify deterministic rejection.

## Performance: no speedup claim

Compare the previous final `after/` baseline to `after-fix/`. Two repetitions of each of six questions; baseline 11/12 completed, follow-up 12/12. Medians exclude failed requests and include retry time for completed requests. Sample sizes are small and provider load varied.

| Metric | Pre-fix | Follow-up |
|---|---:|---:|
| First nonempty answer chunk | 4,506 ms | 7,000.5 ms |
| Total stream latency | 5,561 ms | 7,007.5 ms |
| Planner: successful call median | 1,039 ms | 1,319.5 ms |
| Tool selection/arguments: successful call median | 1,065 ms | 1,251 ms |
| Draft answer: successful call median | 1,593 ms | 1,472 ms |
| Attribution/verification: successful call median | 951 ms | 1,357.5 ms |

Per-call medians do not sum to total-request medians. Retries, retrieval, persistence and scheduling add latency. Calls skipped by the existing no-evidence shortcut are not assigned zero duration in per-call medians. Failed stream-opening instrumentation remains incomplete; these are not billing totals.

### Can a request be removed safely?

- The existing no-evidence shortcut already skips draft generation and attribution, using two generation calls in that branch.
- Draft generation and independent verification cannot simply be combined without losing the independent check that fixes this task's failure. Verification cannot move after publication without reintroducing unsupported SSE text.
- Planner and tool-argument selection are the most plausible future combination, but need a structured plan-with-arguments contract plus mixed-intent/history and authorization regression benchmarks. No unmeasured rewrite was introduced here.
- Keeping four stages for supported RAG is a deliberate safety tradeoff, not a performance optimization. Current evidence does not support claiming a latency improvement.

## Isolation and cleanup

Only database `rag_e2e_1794821537145_f29a7c` at `127.0.0.1:64062`, PostgreSQL 17.11, was used. Separate backend: port 64066. Identity was checked before mutation; existing migrations ran only there. Existing local/production databases and server port 3001 were untouched.

Both disposable containers and temporary secrets removed; spawned backend exited 0. See `after-fix/run.json`. No deployment, commit or agent work.

## Remaining blockers and limits

1. Real approved TradePro policy corpus has not been validated; these synthetic facts must never become real policies.
2. Gemini 503s still cause safe failures; retries/timeouts add latency. Mid-stream replay is intentionally not introduced.
3. Semantic verification remains probabilistic. Deterministic checks cover the observed version/synthetic errors, not every possible paraphrase or citation ambiguity.
4. Mixed invalid-policy answers conservatively fall back as a whole. Separate safe private-answer salvage would need a structured claim design and further tests.
5. Full rendered frontend/browser behavior was not exercised, although actual parser tests and hook inspection confirm final replacement.
6. Existing extracted transfer metadata still carries an unrelated earlier section heading (`PROFILE REVIEW EXERCISE`); title/version/page citations passed. This pre-existing chunk-heading issue was recorded, not refactored under this targeted task.

Commands and safety setup: `README.md`. Exact responses: `after-fix/results.json`; individual call traces: `after-fix/trace.jsonl`; comparison: `fix-metrics.json`.
