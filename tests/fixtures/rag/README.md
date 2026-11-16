# Development-only RAG evaluation

## Scope and review

`observatory.pdf` is a visually reviewed, three-page fictional reference, not a TradePro policy. All 12 answerable facts and their PDF pages are listed in `questions.json`; four other questions have no supporting evidence. Do not publish this fixture outside a disposable development database. The existing sample training PDF was neither read nor published.

The evaluation harness is `tests/integration/rag-live.ts`. It requires an explicitly supplied localhost database named `tradepro_rag_evaluation`, explicit `RAG_EVALUATION_APPROVED=true`, and a fresh database with zero users. It overrides both Prisma URLs, disables dotenv auto-loading, clears inherited provider credentials, and copies only the approved Gemini key/model from `.env`. A dummy Stripe test key satisfies an unrelated eager import. It never starts the HTTP server, workers or Redis. The resume flag is only for this harness's existing synthetic dataset.

## Actual run results — 2026-11-10

- Disposable Docker `pgvector/pgvector:pg17`, PostgreSQL 17.11, pgvector 0.8.7, localhost-only port; no host data volume. All 43 existing migrations applied successfully **only there**. No configured/production database was accessed.
- Embeddings: existing `gemini-embedding-2`, 768 dimensions, unchanged. Generation: configured `gemini-3.5-flash-lite`.
- Actual PDF extraction retained pages 1–3. Actual Gemini embeddings and existing ingestion produced three chunks. Existing publication service rejected the synthetic USER and accepted the synthetic ADMIN.
- Published only versions 1 and 2 of this reviewed fixture through the publication service. Version 2 archived version 1. Actual retrieval returned only version 2 and suppressed an injected identical chunk.
- Synthetic DRAFT/PUBLIC, PUBLISHED/INTERNAL, ARCHIVED/PUBLIC and DRAFT/INTERNAL sample-slug sentinel documents with identical vectors were excluded across 16 queries. Sample publication was explicitly rejected. These sentinels contained only copies of synthetic fixture text, never the real sample PDF.

### Retrieval metrics

12 answerable / 4 unanswerable questions. Unthresholded correct-page top-1 accuracy and MRR: 12/12 and 1.0. At the current threshold, 10 correct passages and one off-topic passage were returned for answerable questions: micro passage precision 10/11 (90.9%). Correct-page recall: 10/12 (83.3%). All four unanswerable questions returned no passages.

| Threshold | Correct-page recall | Unanswerable empty-result rate |
| --- | --- | --- |
| 0.50 | 100% | 0% |
| 0.55 | 100% | 25% |
| 0.60 | 100% | 50% |
| 0.65 | 83.3% | 100% |
| 0.70 | 33.3% | 100% |
| 0.75 | 16.7% | 100% |
| 0.80 | 0% | 100% |

The threshold sweep uses read-only raw vector rankings in the isolated database; customer-facing retrieval restrictions were never lowered. At 0.65, welcome-desk location (0.6232) and dock shape (0.6483) were false negatives. Admission-price and closing-time questions had no answer but moderately high similarities (0.6442 and 0.6348). Similarity is not proof of answerability. **No threshold change is justified from this small synthetic corpus.** Repeat on reviewed in-domain documents and a held-out question set.

### Generation and tools

- All **seven** current declarations selected correctly in one explicit AUTO probe each: price, news, RAG, accounts, balances, transactions, KYC. This tests actual Gemini with existing declarations; it is not the application's full system prompt.
- Four private tools executed against the synthetic user/database and rejected unauthenticated execution. KYC returned REGISTERED; accounts, balances and history returned empty collections. Nonempty-account and cross-user integration cases remain untested; existing mocked ownership tests passed.
- Grounded-answer service: two correct live answers with exact page 1/page 2 citations; two deterministic insufficient-evidence responses; page 3 answer failed twice with Gemini 503 high-demand errors. This phase is **not entirely passing**.
- Full `generateAiResponseWithTools`: AUTO observatory question rejected as OTHER by the financial-domain guard, without a tool call. A domain-qualified synthetic question used RAG under forced ANY but still returned the domain refusal. Withdrawal-fee question used RAG and safely refused unsupported facts. Token usage remained populated.
- Consequently, full-application **AUTO grounded answers/citations are not demonstrated** by this off-domain fixture. The domain guard was not weakened. A reviewed, customer-facing, nonfinancial TradePro navigation/help fixture is the next suitable evaluation corpus.
- Live Twelve Data/Marketaux execution not run: no approved development provider configuration. Their existing mock-backed tests passed. No assertion that all tools passed live end-to-end execution.

### Checks and failures

- `npx tsc --noEmit`: passed.
- Strict standalone TypeScript check of the integration harness: passed.
- Four RAG Vitest suites: 36 passed (with dotenv disabled and a dummy Stripe key).
- Node runner market/reliability/KYC suites: 16 passed, external fetch mocked, database URL nonconnecting.
- Initial attempt to run Node test suites under Vitest failed with "No test suite found"; corrected runner passed. Running isolated RAG tests without the dummy Stripe key also exposed the unrelated eager Stripe import dependency.
- Automatic approval review timed out once for the final follow-up; the permitted retry succeeded.
- No deployment, application changes, schema changes, new migrations, or embedding-model changes.

### Remaining risks

- Small synthetic dataset; no claims about production retrieval quality or latency/load behavior.
- PDF title-case headings yielded null sectionTitle. Actual page citations worked, but section detection and overlap on long/layout-heavy PDFs need a separate fixture. Existing mocked section/overlap tests still pass.
- Main chat exposes retrieved source candidates rather than claim-verified citations. Separate grounded-answer service verified two citations, not arbitrary answer entailment.
- Grounded-answer service currently surfaces transient Gemini failures; no unrelated retry refactor made.
- Safety sentinel tests prove the exercised SQL filters, not every possible adversarial/misclassified document.

## Reproduction

Create a **new disposable** localhost-only pgvector container with no host volume. Get its random port. Set BOTH `DATABASE_URL` and `DIRECT_URL` explicitly to that database for `npx prisma migrate deploy`; never run this against normal `.env` URLs. Do not use migrate dev or reset.

After approving development Gemini usage and reviewing the PDF:

```sh
RAG_EVALUATION_DATABASE_URL='<disposable localhost URL>' \
RAG_EVALUATION_APPROVED=true \
npx tsx tests/integration/rag-live.ts
```

It records `live-results.json`. Review individual failures even when the process exits zero: provider/answer failures are recorded per case to permit independent checks. Stop/remove only the newly created disposable container after review. The run described here was cleaned up after completion.
