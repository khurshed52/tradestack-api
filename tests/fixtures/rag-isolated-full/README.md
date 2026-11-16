# Disposable TradePro RAG evaluation

**Synthetic development facts only. Not TradePro policy.** Never ingest this fixture into a real customer database. The launcher cannot target an existing database: it creates unique Docker containers and a database named `rag_e2e_<timestamp>_<random>`.

## Reproduce

Requires Node 22, installed project dependencies, Docker, `pgvector/pgvector:pg17`, `redis:8-alpine`, and an approved development Gemini key in the local `.env`. The launcher parses only `GEMINI_API_KEY` and `GEMINI_MODEL` from that file; it does not inherit its database or other service credentials.

```sh
node tests/integration/rag-isolated-run.mjs
npx tsc --noEmit
npx tsc --noEmit --rootDir . --module NodeNext --target ES2023 --esModuleInterop --skipLibCheck --strict src/types/express.d.ts tests/integration/rag-isolated-evaluate.ts tests/integration/rag-isolated-server.ts
DOTENV_CONFIG_PATH=/dev/null STRIPE_SECRET_KEY=sk_test_unused npx vitest run src/scripts/ragHardening.test.ts src/scripts/ragIngestion.test.ts src/scripts/groundedAnswer.test.ts src/scripts/knowledgePublication.test.ts
DOTENV_CONFIG_PATH=/dev/null DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused STRIPE_SECRET_KEY=sk_test_unused node --import tsx --test src/modules/ai/tools/market.tools.test.ts src/modules/ai/tools/tool-reliability.test.ts tests/aiKycStatus.test.ts
```

PDF regeneration requires Python/reportlab: `python3 tests/fixtures/rag-isolated-full/create_fixture.py`. The checked-in PDF was visually reviewed on all four pages.

## Safety and methodology

- No access to `localhost:5432/trading` or the existing port-3001 server.
- Independent disposable PostgreSQL and Redis, fresh synthetic admin and two customers.
- Real migrations, auth login, persistent HTTP chat, Gemini embeddings/generation and pgvector queries.
- Existing publication service checks the admin identity from a real login JWT. There is no new publication endpoint.
- Both document publication revisions use the same reviewed PDF bytes. The PDF labels its content as Version 1; database publication revision 2 tests supersession. Do not equate this with verifying changed-PDF-content revision handling.
- Competing excluded documents use copies of synthetic embeddings, never the real sample training PDF. DRAFT/PUBLIC, PUBLISHED/INTERNAL, ARCHIVED/PUBLIC and TRAINING/DRAFT/INTERNAL must remain excluded.
- An exact duplicate chunk is inserted only in the disposable database to test deduplication.
- Real generation calls are paced at >=6.5 seconds between starts; HTTP latency includes this artificial pacing. `trace.jsonl` separates pacing and provider latency.
- 429/503 scenarios are deliberately injected into the SDK boundary of the separate test server. They are **simulated provider faults over real HTTP**, not real Gemini outages.
- Market API credentials are absent. Market provider successes are covered by mocked tests only.
- Similarity comparisons use top-five raw vector rankings of the current publication. Production retrieval remains unchanged at 0.65; public retrieval results are separately recorded after security/dedup filters.
- Expected-page Recall@5 is not claim-level relevance. Faithfulness and citation review must compare answers with the actual `trace.toolResponses` evidence, not merely nonempty retrieval.
- Direct retrieval is run independently from the chat tool (fresh query embeddings); chat tool evidence is separately recorded.
- Secrets and access tokens are not written into reports. Server logs contain only synthetic records, but can include request context; treat artifacts as development diagnostics.
- Normal completion/failure cleans up spawned backend, containers and temporary secrets. Forced host termination cannot guarantee cleanup; use names in `run.json` to inspect/remove only this run's resources.

Outputs: `run.json`, `environment.json` (redacted), `results.json`, `trace.jsonl`, `backend.log`, plus final evaluation report. Cases record errors rather than hiding failures behind aggregate success.
