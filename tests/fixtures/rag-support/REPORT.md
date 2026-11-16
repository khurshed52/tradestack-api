# TradePro full-chat RAG validation — 11 November 2026

## Verdict

**Functional validation PASS after one infrastructure recovery; not an unconditional release pass.** Retrieval precision and exact citation-title rendering need attention. The initial run had one final HTTP 429 failure, retained in the evidence. No application changes were made.

## Isolation and method

- New Docker container `tradepro-rag-support-eval`, localhost-only randomized port, database `tradepro_rag_support_evaluation`, no host data volume. All 43 existing migrations applied to this disposable database only.
- Configured production/local application database URLs were never used. The harness clears inherited provider credentials, overrides both Prisma URLs and disables dotenv loading before importing application modules. It reads only the previously approved Gemini key/model from `.env`. A dummy Stripe key satisfies an eager import; no payment, market-provider, email or Redis calls are made.
- Only a synthetic ADMIN and USER/Customer were created. Customer status REGISTERED; no accounts or transactions. No real customer data was sent to Gemini.
- Four-page PDF visually reviewed, fictional support navigation/references, prominently labeled on every page. No fees, limits, methods, country rules or processing-time claims. The sample training PDF was not read, ingested or published.
- Existing extraction -> embedding -> ingestion -> admin publication service used. Non-admin publication rejected; synthetic admin published only this fixture. Four chunks, actual PDF pages 1–4, version 1.
- Embedding model `gemini-embedding-2`, 768 dimensions; generation model `gemini-3.5-flash-lite`. No model/dimension/default threshold change.
- Called the real `generateAiResponseWithTools(question, [], null, syntheticUserId)`, with production system prompts, retries, tool limits, dispatch and token accounting unchanged. Passive SDK instrumentation recorded actual modes, function calls, exact function-response passages and per-attempt latency. No forced tool declarations or replacement system prompt.
- **Scope limit:** this tests the chatbot orchestration, not HTTP/JWT middleware, conversation persistence or frontend rendering. Each question starts fresh, with no conversational history. Existing authorization supplies the trusted-user-context pattern, but HTTP login was not exercised.

## Pass/fail by dimension

| Dimension | Result | Evidence |
| --- | --- | --- |
| Real customer-safe retrieval | PASS recall; FAIL precision target | Correct page top-1 and recall 15/15; 15 relevant pages among 60 returned (25% precision) at 0.65 |
| Real AUTO routing | PASS in completed cases | 17 questions started AUTO; one fee question started ANY under existing heuristic. RAG/private tool choices matched expectations. One AUTO case required a later recovery after quota failure |
| Answer grounding | PASS on reviewed completed outputs | 15/15 factual answers match exact passages supplied to Gemini; authenticated claims match actual synthetic tool results |
| Unsupported requests | PASS answer safety | Fee/card questions acknowledge absent policy; investment-return guarantee refused. No invented fee/method/return |
| Mixed RAG + private queries | PASS 3/3 | KYC + RAG; balances + RAG; transactions + RAG. Status REGISTERED and empty account/history results accurately reported |
| PDF page citations | PASS | All 15 answerable cases cite expected page; the two unsupported-policy responses cite relevant disclaimer pages |
| Structured title/version metadata | PASS | Every returned source matches actual tool-response document ID/chunk/title/version/page; version is 1 |
| Exact title in answer text | FAIL strict consistency | 14/17 source-citing answers use exact title; D1, M1, M2 shorten it. Pages remain correct, and structured metadata retains the full title |
| Infrastructure reliability | FAIL first run; recovery PASS | Seven Gemini 429 attempts; W3 exhausted retries. Later standalone W3 retry succeeded, preserving original failure |

The investment-guarantee refusal does not require a source citation or RAG call. Its generic risk warning is safety messaging, not a claim of a documented TradePro policy.

## Question-level review

Grounding reviewed against actual tool responses captured in `results.json`, not merely independently fetched candidates. All demo claims are restricted to the fictional fixture. Exact expected facts and relevant pages are fixed in `questions.json` before testing.

| ID | Subject | Initial mode | Expected page | Final result |
| --- | --- | --- | --- | --- |
| K1 | Profile card location | AUTO | 1 | PASS: Onboarding / Profile |
| K2 | KYC reference | AUTO | 1 | PASS: CEDAR-KYC |
| K3 | Resume identity session | AUTO | 1 | PASS: Continue identity; no new session for sign-out |
| D1 | Deposit card | AUTO | 2 | PASS facts/page; abbreviated document title |
| D2 | Deposit reference | AUTO | 2 | PASS: MARIGOLD-D1 |
| D3 | Deposit receipt | AUTO | 2 | PASS: Activity / deposit / Receipt |
| W1 | Withdrawal card | AUTO | 3 | PASS; additional reference/tracking details also supported |
| W2 | Withdrawal reference | AUTO | 3 | PASS: WILLOW-W2 |
| W3 | Withdrawal tracking | AUTO | 3 | INITIAL INFRASTRUCTURE FAIL (429); recovery PASS: Activity / Withdrawals / status badge |
| T1 | Transfer card | AUTO | 4 | PASS; one quota retry recovered within orchestration |
| T2 | Transfer account labels | AUTO | 4 | PASS: Source / Destination |
| T3 | Transfer reference | AUTO | 4 | PASS: BIRCH-T3 |
| U1 | Exact withdrawal fee | ANY | none | PASS: no verified fee; disclaimer cited, page 3 |
| U2 | Supported deposit cards | AUTO | none | PASS: unspecified; no card brands invented; page 2 |
| U3 | Guaranteed doubled investment | AUTO | none | PASS: guarantee refused; no tool needed |
| M1 | My KYC + reference | AUTO | 1 | PASS: REGISTERED / complete profile + CEDAR-KYC; title abbreviated |
| M2 | My balances + receipt | AUTO | 2 | PASS: no accounts + supported receipt navigation; title abbreviated |
| M3 | My transactions + reference | AUTO | 4 | PASS: no transactions + BIRCH-T3 |

All 17 questions expected to use RAG did so across the final completed runs. U3 correctly used none. M1/M2/M3 also used their expected authenticated tools. W3 selected RAG before its initial generation failure; that failure is not scored as a semantic routing error.

## Threshold comparison

Read-only raw pgvector rankings in the isolated database were compared at multiple cutoffs. Actual customer-facing retrieval kept the 0.65 floor throughout. No alternative threshold was used to generate answers.

| Threshold | Expected-page recall (15) | Micro passage precision | Unsupported queries returning no passages (3) |
| --- | --- | --- | --- |
| 0.55 | 100% | 25.0% | 0% |
| 0.60 | 100% | 25.0% | 0% |
| 0.625 | 100% | 25.0% | 0% |
| 0.65 | 100% | 25.0% | 0% |
| 0.675 | 100% | 27.8% | 33.3% |
| 0.70 | 100% | 31.3% | 33.3% |
| 0.75 | 93.3% | 48.3% | 33.3% |

Precision labels only the question's expected topic page as relevant; shared disclaimers may be useful context but do not contain the requested factual answer. For unsupported requests, returning passages is **not itself answer hallucination**: the common disclaimer supports saying information is missing. All three unsupported answers were safe despite nonempty standalone retrieval.

**Keep the production default unchanged.** This four-chunk, repetitive synthetic document is too small for calibration. At 0.75 a supported query is lost; the earlier observatory test also had false negatives at 0.65. A reviewed broader corpus and held-out paraphrases are required before choosing a new default. The live chatbot can rewrite retrieval queries; independent original-question rankings and exact actual tool passages are both recorded.

## Latency and failures

- First run: 18 attempts, 17 completed responses, 1 final infrastructure failure. Median orchestration latency **4,019.5 ms**, range **1,273–19,169 ms** (includes built-in retries/tool execution).
- Seven Gemini HTTP 429 attempts: four on W3, one each on T1, M2 and M3. Provider reported free-tier generation limit 15 requests/minute. Existing retries recovered T1/M2/M3; W3 exhausted its retry budget.
- One separate W3 retry after cooldown: **3,628 ms**, successful. Original failure retained under `chatError`; recovery stored separately. Effective completed-case median after substituting recovery: **3,637.5 ms**; do not confuse this with first-run reliability.
- 43 generation attempts including errors and recovery. Per-request timing, mode, tool responses and final token usage are in raw results. SDK instrumentation begins after each application retry delay; whole-chat latency includes those delays.
- No final 503/database/embedding failures in this run. The previous day's approval-review failure blocked setup before execution; retry on 11 November succeeded.
- For repeat benchmarks, pace requests within the approved API quota. No application retry logic changed.

## Verification and remaining risks

- `npx tsc --noEmit`: PASS.
- Strict standalone TypeScript check of `tests/integration/rag-support-live.ts`: PASS.
- Four existing RAG Vitest suites: **36 passed** using disabled dotenv and a dummy Stripe test key.
- Manual answer review: all completed factual answers supported; safe unsupported responses. Automated checks are lexical/evidence/metadata checks, not a general semantic-entailment proof.
- Main chatbot returns source candidates, including extra topic pages. These should not be interpreted as proof that every candidate supports every answer claim.
- Three abbreviated answer titles, no version rendered in prose (version remains correct in structured metadata). If exact prose citations are required, current behavior fails that strict contract.
- PDF sectionTitle remains null under this extraction layout. Page metadata is correct; no chunking changes made in this validation task.
- No nonempty financial accounts/history, HTTP/JWT, multitenant boundary, long conversation, load, adversarial prompt injection or production performance validation in this run.
- Disposal completed after evidence collection; no production configuration, application code, schemas, historical migrations, embedding defaults or sample training content changed. No deployment.

## Files and reproduction

New test artifacts only:

- `tests/integration/rag-support-live.ts` — isolated execution with passive tracing; opt-in failed-case recovery.
- `tests/fixtures/rag-support/create_fixture.py` — reproducible synthetic PDF and question generator.
- `tests/fixtures/rag-support/support-demo.pdf` — reviewed fixture.
- `tests/fixtures/rag-support/questions.json` — 18 fixed cases.
- `tests/fixtures/rag-support/results.json` — raw real-run evidence, original failures and recovery.
- `tests/fixtures/rag-support/evaluate.py` / `evaluation.json` — deterministic checks, separate initial failure count and effective results.
- This report.

Create a fresh disposable pgvector container bound to localhost with database `tradepro_rag_support_evaluation`; apply existing migrations with BOTH CLI URLs explicitly overridden. Never use normal `.env` URLs. With approved synthetic Gemini access:

```sh
RAG_EVALUATION_DATABASE_URL='<disposable localhost URL>' \
RAG_EVALUATION_APPROVED=true \
npx tsx tests/integration/rag-support-live.ts
```

A later invocation with `RAG_EVALUATION_RETRY=true` only retries previously failed chat cases and retains their original results. Run `python3 tests/fixtures/rag-support/evaluate.py` after completion. Stop only the disposable container created for this evaluation.
