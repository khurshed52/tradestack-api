# TradeStack Deployment Runbook — Render + Neon

## Permanent project context

- **Product:** TradePro trading and financial management platform.
- **Backend:** TradeStack; Node.js, Express, TypeScript, Prisma 7, PostgreSQL.
- **Deployment:** Render web service; Neon-hosted PostgreSQL.
- **Architecture:** Feature-based modular monolith with routes, controllers, validation, and services.
- **Modules:** Authentication, customer/profile, Veriff KYC, trading accounts, deposits, withdrawals, internal transfers, customer reports, market data.
- **Customer report endpoints:** `POST /reports/deposits`, `POST /reports/withdrawals`, `POST /reports/transfers` (authenticated).
- **Payments:** Stripe; CoinPayments integration is paused. Do not change payment flows during routine deployments.
- **Working preference:** Guide deployment **one small step at a time**; verify each step before continuing.

## Production safety rules

1. **Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against production Neon.**
2. Do not delete, recreate, or reset production data.
3. Never commit or share `.env` files, database URLs, tokens, or credentials.
4. Commit `prisma/schema.prisma`, `prisma/migrations/`, application code, and relevant lockfile changes together.
5. Inspect generated migration SQL for destructive changes, locks, constraints, and required backfills.
6. Before production schema changes, verify a suitable Neon backup/restore point or recovery mechanism and understand recovery limitations.
7. Check compatibility between old and new application versions; use staged/expand-contract migrations for breaking changes.
8. Apply production migrations once in a controlled deployment step; stop if they fail.

## Deployment configuration — fill in once

| Item | Current value |
|---|---|
| Render service name | TODO |
| Render service URL | TODO |
| Git branch / deployment trigger | TODO |
| Render build command | TODO |
| Render start command | TODO |
| Render pre-deploy command | TODO |
| Node version | TODO |
| Package manager | TODO |
| Prisma schema path | `prisma/schema.prisma` (verify) |
| Prisma config (`prisma.config.ts` etc.) | TODO |
| Neon project and production branch | TODO |
| Neon recovery / backup procedure | TODO |
| Database environment variable **names only** | TODO |
| Health check endpoint | TODO |

**Neon connection note:** Pooled URLs are commonly used at runtime and direct URLs for migrations, but actual Prisma 7 configuration varies. Inspect the project's Prisma config and Neon settings before selecting a connection string. Do not assume environment variable names.

## Standard release: backend code + Prisma schema changes

### 1. Prepare locally

- Review `git diff` and identify schema changes.
- Confirm the configured database is **development**, not production.
- If a new migration is required, create it against development only:

  ```bash
  npx prisma migrate dev --name descriptive_change_name
  ```

- Inspect the generated SQL and test the migration against a non-production database.
- Generate Prisma Client and typecheck:

  ```bash
  npx prisma generate
  npx tsc --noEmit
  ```

- Run repository-specific tests and build commands (check `package.json`; do not assume scripts exist).
- Commit application code, Prisma schema, migration files, and lockfile. Exclude secrets.

### 2. Prepare production

- Identify the exact Render service and Neon **production** branch.
- Confirm the last known good deploy and check Render build/start/pre-deploy commands.
- Create and verify a suitable Neon restore point/backup before applying migrations.
- Review migration SQL for destructive or backward-incompatible operations.
- Choose one controlled migration runner, such as a properly configured Render pre-deploy command or a manual release step. Avoid concurrent migration runs.

### 3. Deploy

- Push the reviewed commit and trigger the configured Render deployment.
- Apply **already-created, committed** migrations using the production migration connection:

  ```bash
  npx prisma migrate deploy
  ```

- Ensure Render generates Prisma Client and builds the TypeScript backend according to the repository's configuration.
- Verify the new service starts and logs show no database or runtime errors.

**Ordering matters:** Render pre-deploy may run migrations before the new application starts. For breaking changes, plan an expand → deploy → backfill → contract sequence; don't assume a universal deploy order is safe.

### 4. Verify

- Confirm Render service health and Neon connectivity.
- Check migration state with the correct production configuration:

  ```bash
  npx prisma migrate status
  ```

- Smoke-test authentication, customer account retrieval, and report endpoints with an authorized test customer.
- Example safe report request:

  ```json
  {"page":1,"pageSize":10,"filters":{}}
  ```

- Verify pagination, customer data isolation, and expected response format.
- Do **not** perform real-money transfers, deposits, or withdrawals just to smoke-test a deployment.

## Rollback and failures

- **Application regression:** Roll back Render code only if the current database schema remains compatible.
- **Failed migration:** Stop deployment, inspect migration state and logs, and plan a corrective migration. Never reset production.
- **Breaking database change:** An older code deployment might not work; use a forward fix or carefully planned restore. Restoring a database may discard writes made after the recovery point.
- Document the migration, incident, resolution, and verification results.

## How to ask for help next time

> Follow `TRADESTACK_DEPLOYMENT.md`. I'm deploying TradeStack to Render with Neon PostgreSQL. I have backend code changes and [database schema changes / no schema changes]. Guide me **one step at a time**, checking `package.json`, Prisma 7 configuration, Render deployment settings, and migration status first. Never suggest destructive production commands. Ask for configuration names and settings, not secrets.

## Release log

```text
Date:
Commit SHA:
Render deployment:
Neon production branch:
Migration files:
Backup/restore point:
Migration result:
Build result:
Smoke tests:
Notes/rollback plan:
```

_Last updated: 2026-10-13. Verify all commands against the project's actual configuration before executing against production._
