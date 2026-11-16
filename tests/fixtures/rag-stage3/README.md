# Stage 3 verification, 16 November 2026

This harness creates a **new disposable PostgreSQL/pgvector + Redis** pair and a separate Express server. It never accesses the existing `localhost:5432/trading` database or port 3001. It copies only the previously approved Gemini key/model from `.env` into a minimal test environment; credentials are redacted from saved artifacts. It uses the previously reviewed **synthetic** four-page PDF in `../rag-isolated-full/support-demo.pdf`. These are not real TradePro policies.

Requires Node 22, installed dependencies and Docker. Use the final code for a new isolated after run:

```sh
node tests/integration/rag-stage3-run.mjs after
node tests/integration/rag-stage3-metrics.mjs
npx tsc --noEmit
npx tsc --noEmit --rootDir . --module NodeNext --target ES2023 --esModuleInterop --skipLibCheck --strict src/types/express.d.ts tests/integration/rag-stage3-evaluate.ts tests/integration/rag-stage3-server.ts
DOTENV_CONFIG_PATH=/dev/null STRIPE_SECRET_KEY=sk_test_unused npx vitest run src/scripts/aiStage3.test.ts src/scripts/aiSseController.test.ts src/scripts/aiToolCancellation.test.ts src/scripts/ragHardening.test.ts src/scripts/ragIngestion.test.ts src/scripts/groundedAnswer.test.ts src/scripts/knowledgePublication.test.ts
DOTENV_CONFIG_PATH=/dev/null DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused STRIPE_SECRET_KEY=sk_test_unused node --import tsx --test src/modules/ai/tools/market.tools.test.ts src/modules/ai/tools/tool-reliability.test.ts tests/aiKycStatus.test.ts
```

The recorded `before` directory is the actual pre-edit baseline. Running `before` now benchmarks the current implementation and would overwrite that evidence; it does **not** restore old source. `after-first` records the intermediate run before the final no-source response guard. `after` records the final implementation. Do not treat intermediate runs as final results.

Each benchmark asks the six requested questions twice. Final after runs add two repeated synthetic-evidence/adversarial questions, excluded from the six-question latency comparison. A 15-second cooldown **between requests** reduces quota pressure and is excluded from response latency. No artificial delay is inserted between generation calls/chunks.

TTFT measures first nonempty `chunk` SSE event, not the initial headers/status event. Total latency measures HTTP stream completion. The final `done.data.reply` is authoritative and can differ from provisional chunks. Citation latency includes the separate model attribution call. Baseline retrieval timing uses `AI_TOOL_ROUND` around the RAG tool; new metrics also expose `retrievalDurationMs` directly. SDK request counts include planner, tool selection, answer and attribution; embeddings are not included in that generation-call count. Failed/aborted calls may have no returned usage, so token totals are not a billing ledger.

Raw responses, traces, redacted environment and cleanup evidence live under each phase directory. No access tokens or real customer data are saved. Fixtures are ingested and published by the existing services using a synthetic admin identity verified through real login. Excluded document sentinels clone only synthetic vectors. Old version 1 is archived when version 2 is published. Both versions use the same reviewed PDF bytes; version metadata filtering, not changed-content migration, is tested.

Normal completion/failure cleans up containers, spawned server and temporary secrets. Host/process termination can interrupt cleanup; inspect only names in that run's `run.json` if manual cleanup is needed.

## Follow-up grounding fixes

The original `after/` results remain the pre-fix baseline. Run the targeted follow-up without overwriting that evidence:

```sh
node tests/integration/rag-stage3-run.mjs after-fix
node tests/integration/rag-stage3-fix-metrics.mjs
node --import tsx tests/integration/rag-frontend-contract.mjs /path/to/ai-trading-frontend
```

`after-fix/` adds an exact comparison of concatenated SSE chunks with the final reply. Knowledge answers now wait for whole-policy-answer verification, including source metadata checks. Other answers retain immediate generation streaming. Consequently first-answer latency is no longer measuring an unchecked draft for RAG; comparisons must include that safety tradeoff. The frontend contract check loads its existing service read-only with mocked fetch; it does not start Next.js or connect to an API/database.

Per-stage performance is in `fix-metrics.json`: planner, tool-selection/arguments, draft answer and verification/attribution. Generation retries are separate attempts. The baseline's `tool-or-answer` stage is the forced tool-selection request in these RAG cases. Failed requests are reported separately from successful-attempt medians.
