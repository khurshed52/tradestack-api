# TradeStack Backend Development Guide

> Working conventions based on the TradeStack source excerpts shared October 14, 2026. This is a reference for future feature work, **not** a claim that every module follows every convention. Verify unconfirmed details against the actual repository.

## 1. Stack and deployment

- Backend: Node.js, Express.js, TypeScript.
- Database: PostgreSQL; Prisma ORM v7 with generated client at `src/generated/prisma` and ESM imports using `.js` extensions.
- Validation: Zod (`z` from `zod`).
- Backend hosting: Render; database: Neon.
- Frontend: TradePro (Next.js, React, TypeScript, Tailwind CSS, Ant Design).

## 2. Module organization

Use the existing Route → Controller → Service architecture, with a validation file when inputs require validation:

```text
src/modules/<feature>/
├── <feature>.route.ts
├── <feature>.controller.ts
├── <feature>.service.ts
└── <feature>.validation.ts
```

- **Route:** Express endpoint registration; follow existing module conventions for middleware.
- **Controller:** Read authenticated identity, interpret/validate HTTP inputs using the established project pattern, invoke service, format HTTP responses and forward errors.
- **Service:** Business logic, Prisma reads/writes, authorization scoping, transactions, pagination and data shaping.
- **Validation:** Zod schemas for relevant client-controlled inputs; don't invent query parameters or middleware conventions.

**Not yet verified:** The precise validation invocation (`parse`, `safeParse`, custom middleware), shared response helper, error mapping and controller style. Request one real controller/route pair before implementing these parts.

## 3. Express app and routes

The main app mounts API routes with `app.use('/api', routes)` and places `errorHandler` last. Signature-sensitive Stripe, CoinPayments and Veriff webhook routes are registered **before** `express.json()`; preserve this ordering.

In `src/routes/index.ts`:

1. `routes.use(apiRateLimiter)` applies a general API rate limiter.
2. `/auth` and `/misc` are public API mounts.
3. `routes.use(authenticate)` protects all routes registered afterward.
4. Protected mounts include `/customer`, `/crypto`, `/payment`, `/profile`, `/kyc`, `/admin`, `/accounts`, `/funds`, `/reports`, and newly added `/notifications`.

When adding a protected module, register it **after** `routes.use(authenticate)`. Do not edit `app.ts` unnecessarily.

## 4. Authentication and ownership

`src/middleware/authenticate.ts`:

- Requires `Authorization: Bearer <token>`.
- Calls `verifyAccessToken(token)`.
- Assigns `req.user = { id: payload.sub!, role: payload.role as string }`.
- Returns HTTP 401 for missing/invalid/expired tokens.

Use `req.user.id` for the logged-in user. **Never trust a client-provided `userId` for ownership-sensitive operations.** In services, scope queries and mutations to that user (and, where appropriate, their Customer record). For updates by record ID, use an ownership-scoped condition so one user cannot modify another user's record.

## 5. Prisma schema relationships and conventions

- `User.id`: UUID; `User.role`: `USER` or `ADMIN`.
- `Customer.userId`: unique UUID relation to `User.id`; `User.customer` is optional.
- `TradingAccount.customerId` links accounts to customers.
- `FundTransaction.customerId` links transactions to customers.
- Prisma `Decimal` is used for balances and transaction amounts; avoid JavaScript floating-point arithmetic for monetary operations.
- The Notification schema added during this feature includes `Notification.userId` linked to `User.id`, `isRead`, `readAt`, `type`, `title`, `message`, `actionUrl`, `eventKey`, `createdAt`, and indexes on `(userId, createdAt)` and `(userId, isRead)`.

Use the existing shared Prisma Client import path **only after verifying it** in the repository; `src/lib/prisma.ts` was suggested previously but not confirmed.

## 6. API response shape

The demonstrated transaction-history API returns:

```json
{
  "statusCode": 200,
  "message": "Transactions retrieved successfully",
  "data": {
    "page": 1,
    "pageSize": 10,
    "dataCount": 14,
    "pageCount": 2,
    "pageData": []
  }
}
```

For new list endpoints, preserve the established `statusCode` / `message` / `data` envelope and pagination keys, subject to confirmation of the existing controller/response helper.

## 7. Pagination pattern (verified in transaction-history service)

The `getTransactionHistory` service receives an object with `userId`, `page = 1`, `pageSize = 10`, and `filters = {}`. It:

1. Looks up the Customer using `userId` and checks `isActive`.
2. Bounds `page` to at least 1 and `pageSize` between 1 and 100.
3. Calculates `skip = (page - 1) * pageSize`.
4. Constructs a Prisma `where` condition scoped to `customerId`.
5. Uses `prisma.$transaction([count(...), findMany(...)])` to retrieve count and page data together. This groups operations but does not automatically guarantee a single consistent snapshot under every isolation level.
6. Sorts by `createdAt desc`, then `id desc` for deterministic ordering.
7. Returns `{ page, pageSize, dataCount, pageCount, pageData }`.

**Important:** The supplied service excerpt does **not** show whether `page`/`pageSize` originate from request body, query, or another controller input. Do not assume or prescribe query-parameter validation. Follow the real controller contract.

## 8. Zod validation style

The existing funds validation file exports named schemas such as `createDepositSchema`, `withdrawSchema`, `transferSchema`, `transactionHistorySchema`. Patterns include:

- `z.object({...})` and named exports.
- `.trim()`, `.regex(...)`, `.min(...)`, `.max(...)`, `.positive(...)`.
- `.toUpperCase().pipe(z.enum(...))` for normalized enums.
- `z.coerce.number().int().min(...).default(...)` for pagination.
- Optional nested filters with `.default({})`.

Create a `<feature>.validation.ts` where input validation is needed, but match the actual route/controller validation flow once inspected. Endpoints without client inputs, such as unread-count, do not need an artificial validation schema.

## 9. Funds and balances: existing invariants

- Available trading balance = `balance - reservedBalance`, floored at zero for customer display.
- The account-list API exposes `availableBalance` as a string; the frontend should not infer it from `balance` alone.
- Withdrawal creation reserves funds; rejection/failure releases reservation; completion decrements both balance and reserved balance.
- Internal transfers check available source balance and recheck it inside a serializable Prisma transaction.
- Preserve idempotency and existing funds business rules when integrating notifications.
- Transaction-status notifications should be created reliably with state changes; prefer transactionally coupled creation where feasible, with an `eventKey` to prevent duplicates on retries.

## 10. Notification Center: current progress and planned contract

**Completed in development (as reported by user):**

- Prisma `Notification` model and `NotificationType` enum added; schema formatted and validated.
- Local development migration `add_notifications` applied; Prisma Client regenerated; TypeScript passed.
- Notification router skeleton created and registered at `/api/notifications` after authentication; TypeScript passed.

**Implementation status to verify in repo:**

- A proposed unread-count controller and service were provided, but user did not explicitly confirm final integration after the service-layer correction. Check files before assuming endpoint works.
- A draft `notification.validation.ts` was suggested with query pagination; user rejected introducing query-based validation without matching existing conventions. **Do not assume this file was added or approved.**

**Planned endpoints (not all implemented):**

| Method | Path | Function |
|---|---|---|
| GET | `/api/notifications/unread-count` | Count unread for authenticated user |
| GET | `/api/notifications` | Paginated list for authenticated user |
| PATCH | `/api/notifications/:id/read` | Mark one owned notification read |
| PATCH | `/api/notifications/read-all` | Mark all owned notifications read |

Planned frontend: Ant Design bell and unread badge, list/dropdown and notifications page, polling every 30 seconds, refresh on window focus and after read actions. Polling fetches notifications; backend event handlers create them.

## 11. Development and production safety

- Work in small, reviewable steps; provide copy-paste-ready changes.
- After each code change, run `npx tsc --noEmit`.
- Validate schema with `npx prisma format` and `npx prisma validate` as appropriate.
- Use `npx prisma migrate dev --name <name>` **only on a confirmed development database**.
- Review generated SQL and take appropriate backups before production changes.
- Use `npx prisma migrate deploy` for production migrations; **never** run `migrate dev`, `db push`, or `migrate reset` against production.
- Avoid unrelated changes to existing funds, webhook, or auth code.

## 12. Checklist for starting a new module

Before writing implementation:

1. Check current schema/models and relationships.
2. Inspect one real route/controller/service/validation example relevant to the feature.
3. Confirm request transport (body vs query vs params), Zod parsing, error handling, and response envelope from actual code.
4. Define ownership and role checks.
5. Plan migrations and transaction/idempotency behavior if needed.
6. Implement one small step, run `npx tsc --noEmit`, and wait for confirmation.

---

Never change this code before my Permission
Registration and OTP.
MT5, balances, deposits, withdrawals, and payments.

*Maintained as a living guide. Update whenever source code establishes or changes a convention; distinguish verified facts from proposals.*
