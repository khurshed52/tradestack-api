# Running development chatbot: transfer PDF end-to-end test

## Verdict

**One real end-to-end transfer test PASSED through the running authenticated HTTP chatbot, including an explicit PDF/page citation.** Other wording variants exposed citation/routing inconsistencies, and one combined private-tool request returned an unexplained HTTP 500. Those failures have not been erased or attributed to Gemini without evidence.

## Database and authorization verification

- User explicitly confirmed `localhost:5432/trading` contains only development/test customers, no real customers or copied production data, and the running server uses this checkout/configuration. This is the data-provenance basis; counts alone cannot establish that records are synthetic.
- Read-only database identity: `current_database() = trading`, server address `::1/128`, server port `5432`.
- Before testing: 17 Users, 15 Customers. After creating exactly one synthetic test customer: 18 Users, 16 Customers.
- Running process PID 54341 had working directory `/Users/khurshedkhan/Documents/backend-starter`; listener port 3001. The listener binds all interfaces, not exclusively loopback. `.env` does not set NODE_ENV. No claim of enforced network isolation or a runtime production-mode check is made.
- Configured `RAG_TEST_ADMIN_USER_ID` resolved to an active ADMIN. Existing publication service used that configured identity; no roles changed. Publication by the synthetic USER was rejected.
- **Same-database proof:** the test created a fresh synthetic user directly in `trading`, logged in through `POST http://localhost:3001/api/auth/login`, and verified that the JWT session ID was present in this same database with the newly created user's ID. Successful chatbot conversation IDs were also checked against this user's persisted conversations in the same database.
- No production connection/configuration changes. No database migrations. No server restart, deployment, or application-code changes.

## Published fixture

- Title: **TradePro Synthetic Transfer Walkthrough - Development Only**
- Slug: `tradepro-synthetic-transfer-orchid-611`
- Document ID: `d4327b96-7d76-447c-a4df-3e0abe91a913`
- Version: **1**; state: **PUBLISHED / PUBLIC**, only in the confirmed development database.
- Two-page PDF, visually reviewed, with fictional-development disclaimer on both pages. Existing extraction/embedding/ingestion/publication services used; two actual-page chunks produced.
- Page 2 contains the navigation `Funds -> Transfer rehearsal -> Preview route`, the fictional field labels `Origin pocket` / `Target pocket`, and unique reference **TP-XFER-ORCHID-611**.
- Page 2 chunk ID: `3c194163-a673-4f3d-bc69-d52b8d00bd34`.
- Existing sample-training versions 1, 2 and 3 remained DRAFT/INTERNAL. Before/after snapshots, including updatedAt, matched. Final read-only verification reconfirmed these states. The sample PDF files/content were not ingested or published.
- Existing unrelated published `TradePro AI RAG Integration Test` was left unchanged.

## Exact successful HTTP test

`POST http://localhost:3001/api/ai/chat/persistent`

```json
{
  "message": "In the TradePro demo, where is Transfer rehearsal and which tab should I choose next?"
}
```

**HTTP 200**; response message: `AI response generated and saved`.

Exact answer:

> In the synthetic TradePro demo, you can find Transfer rehearsal by opening Funds. Next, you should choose the Preview route tab (TradePro Synthetic Transfer Walkthrough - Development Only, page 2).

Relevant exact response data:

```json
{
  "conversationId": "ecc27594-67c6-4604-a8a4-c082cda02739",
  "category": "PLATFORM_POLICY",
  "toolUsed": true,
  "toolsCalled": ["search_platform_knowledge"]
}
```

The response's `ragRetrievedSources` includes the exact document ID/title, version 1 and page 2 chunk listed above. Returned chunk IDs were matched against stored PDF passages. The answer's instructions are supported by page 2.

The current routing helper classifies this wording **AUTO**. The HTTP request supplied only `message` and the legitimate login Bearer token; no tool execution was requested explicitly or forced by the harness. The API confirms the tool name in `toolsCalled`. No live SDK instrumentation was added to the running server, so mode is established from the current route/orchestration code, not a newly exposed mode field.

Latency: **12,269 ms**. All exact HTTP response bodies are retained in `results.json`; login credentials/access tokens are redacted or never written.

## Check-by-check results

| Requirement | Result | Evidence |
| --- | --- | --- |
| Relevant published PDF retrieval | PASS | Initial transfer query retrieved page 2 at ~0.800 similarity; page 1 at ~0.739 |
| Correct actual page | PASS | Extracted PDF page 2, stored chunk pageNumber 2, API metadata pageNumber 2 |
| Automatic RAG tool | PASS qualified wording; wording sensitivity remains | Qualified AUTO query calls search_platform_knowledge; another AUTO variant was rejected as off-topic |
| Accurate answer | PASS | Funds / Transfer rehearsal / Preview route supported verbatim by page 2; initial answer also correctly returned TP-XFER-ORCHID-611 |
| Correct title/page citation | PASS qualified query; inconsistent overall | Qualified answer cites full title + page 2; initial answer omitted inline citation |
| Unrelated questions exclude fixture | PASS 3/3 | Password reset, KYC requirements, Japan capital: no fixture in direct retrieval or returned supporting sources |
| Existing private tools | PASS focused HTTP/service tests; one unresolved combined failure | KYC HTTP and three-tool accounts/balances/history HTTP succeeded; all four direct tools succeeded and rejected missing authentication |

## All HTTP chatbot outcomes

| Case | HTTP | Tools | Result |
| --- | --- | --- | --- |
| Initial transfer/reference question | 200 | search_platform_knowledge | Correct instructions and TP-XFER-ORCHID-611, correct structured metadata, **no inline citation**. Existing heuristic classifies ANY |
| Password reset | 200 | search_platform_knowledge | Safe missing-documentation response; no transfer fixture |
| KYC document requirements | 200 | search_platform_knowledge twice | No transfer fixture. Cites only preexisting test-document candidate; not a validation of real KYC policy |
| Capital of Japan | 200 | none | Domain refusal; no fixture |
| All four private tools together | **500** | Not exposed in error body | `{"statusCode":500,"message":"Internal server error","data":null}`; 5,570 ms |
| Unqualified AUTO transfer wording | 200 | none | Generic financial-domain refusal; **routing/domain classification failure for this fixture wording** |
| Focused KYC | 200 | get_my_kyc_status | REGISTERED; next step complete KYC profile |
| Accounts/balances/history | 200 | get_my_trading_accounts, get_my_account_balances, get_my_fund_transactions | Correctly reports no accounts or transactions for synthetic user |
| TradePro-qualified AUTO transfer | 200 | search_platform_knowledge | **Full grounding + title/page citation PASS**, exact response above |

Initial transfer answer (exact):

> In the synthetic TradePro transfer demo, after opening Funds, you select Transfer rehearsal and choose the Preview route tab. The unique support reference for this demo is TP-XFER-ORCHID-611.

Focused KYC answer (exact):

> Your current KYC account status is REGISTERED. Your next required step is to complete your KYC profile on the TradePro platform.

Accounts/balances/history answer (exact):

> You currently have no trading accounts or fund transactions registered under your profile.

## Remaining failures and limitations

1. **Inline citation inconsistency:** correct source metadata does not guarantee an inline document/page citation. The initial transfer answer failed this requirement; qualified follow-up passed. No prompt/parser changes made to hide the failure.
2. **AUTO/domain sensitivity:** `Where is Transfer rehearsal, which tab comes next, and what support reference goes with this synthetic walkthrough?` was refused without RAG. Adding explicit TradePro context succeeded. Both observations retained.
3. **Unexplained HTTP 500:** the original combined private query failed. Direct services and focused HTTP requests passed afterward. No server terminal log was attached to this chat; do not assume quota, provider failure or a tool bug from the generic error response.
4. Retrieval includes extra candidates (fixture page 1 and the previously published test document). These are not proof that every candidate supports the answer.
5. This is a small positive/negative integration test, not a guarantee for all questions, nonempty financial histories, load, or adversarial prompts. No real transfers, deposits, payments or market-data operations ran.
6. Development-only provenance relies on the owner's explicit confirmation plus the local database/session evidence. The server is not bound exclusively to loopback; no network/security configuration was changed.

## Test data retained and cleanup

The published synthetic PDF, one synthetic User/Customer, and test chat history remain in the development database so the fixture can be tested in the actual UI. The harness rotated only its own synthetic user's random credential for follow-up logins; credentials were never printed or stored in reports. Existing customers were not modified. All test login sessions were revoked; final active-test-session count is **0**.

## Files and checks

Added only:

- `tests/integration/rag-transfer-http.ts`
- `tests/integration/rag-transfer-private-check.ts`
- `tests/integration/rag-transfer-http-followup.ts`
- `tests/fixtures/rag-transfer-http/transfer-demo.pdf`
- `tests/fixtures/rag-transfer-http/results.json`
- This report.

`npx tsc --noEmit`: PASS. Strict standalone TypeScript check covering all three new harness files: PASS. No RAG refactor, security relaxation, embedding/threshold changes or production deployment.

Do not blindly rerun the initial ingestion script: the fixture is already published. Use the recorded document/conversation IDs or a normal authenticated development chatbot session to review it. Follow-up harnesses affect only the explicitly identified synthetic user and preserve earlier outcomes.
