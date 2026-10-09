# Trading Backend — Project Status

> **Purpose:** Track implemented backend features, business flows, integrations, and postponed production work.
>
> This file is the development source of truth for project progress.  
> Detailed documentation such as architecture, API reference, database documentation, security documentation, and integration documentation will be created later.

---

# 📊 Project Overview

| Module | Status |
|---|---|
| Authentication | 🟢 Implemented |
| Customer | 🟢 Implemented |
| Profile | 🟢 Implemented |
| KYC | 🟢 Implemented |
| Trading Accounts | 🟢 Implemented |
| Funds | 🟢 V1 Implemented |
| Deposits | 🟢 Implemented |
| Withdrawals | 🟢 V1 Implemented |
| Transfers | 🟢 Implemented |
| Transaction History | 🟢 Implemented |
| Stripe Deposit Integration | 🟢 Implemented |
| FX Integration | 🟢 Implemented |
| MT5 Integration | 🟡 Later |
| Real Withdrawal PSP | 🟡 Later |
| Production Security Hardening | 🟡 Later |
| Full Documentation | 🟡 Later |

---

# 🔐 1. Authentication

## Overview

Authentication manages registration, account verification, login sessions, token refresh, logout, and password recovery.

### Authentication Flow

```text
Register
   ↓
Registration OTP
   ↓
Verify OTP
   ↓
Account Verified
   ↓
Login
   ↓
Access Token / Refresh Token
```

---

## Implemented

- [x] User registration
- [x] Registration OTP verification
- [x] Registration OTP resend
- [x] Login
- [x] Refresh token
- [x] Logout
- [x] Forgot password
- [x] Password-reset OTP verification
- [x] Reset password
- [x] OTP resend
- [x] Authentication middleware
- [x] Protected API routes

---

## API Coverage

| Feature | Status |
|---|---|
| Register | ✅ |
| Verify registration OTP | ✅ |
| Resend registration OTP | ✅ |
| Login | ✅ |
| Refresh token | ✅ |
| Logout | ✅ |
| Forgot password | ✅ |
| Verify password-reset OTP | ✅ |
| Reset password | ✅ |
| Resend OTP | ✅ |

---

## Production TODO

- [ ] Final authentication security review
- [ ] Authentication rate limiting
- [ ] Login abuse protection
- [ ] OTP abuse protection
- [ ] Security monitoring
- [ ] Authentication audit logging

---

# 👤 2. Customer

## Overview

The Customer module manages customer records and their relationship with authenticated users.

---

## Implemented

- [x] Customer creation
- [x] Get customers
- [x] Get customer by ID
- [x] Update customer
- [x] Delete customer
- [x] Customer ↔ User relationship
- [x] Customer active/inactive state
- [x] Customer authentication protection
- [x] Customer ownership validation

---

## API Coverage

| Feature | Status |
|---|---|
| Add customer | ✅ |
| Get customers | ✅ |
| Get customer by ID | ✅ |
| Update customer | ✅ |
| Delete customer | ✅ |

---

# 👤 3. Profile

## Overview

Provides authenticated users access to their profile information.

---

## Implemented

- [x] Authenticated profile retrieval
- [x] Protected profile access

---

## API Coverage

| Feature | Status |
|---|---|
| Get profile | ✅ |

---

# 🪪 4. KYC — Know Your Customer

## Overview

The KYC module handles customer identity information, identity verification, agreement signing, verification callbacks, and the approval workflow.

### KYC Flow

```text
Customer
   ↓
Customer Profile
   ↓
KYC Information
   ↓
Identity Session
   ↓
Identity Verification
   ↓
Verification Webhook
   ↓
Agreement Signing
   ↓
KYC Review
   ↓
Approval Decision
```

---

## Implemented

- [x] KYC profile
- [x] Update KYC information
- [x] Identity verification session
- [x] Verification webhook
- [x] Agreement signing
- [x] KYC approval flow
- [x] KYC status tracking
- [x] KYC review workflow

---

## API Coverage

| Feature | Status |
|---|---|
| KYC profile | ✅ |
| Update KYC | ✅ |
| Identity session | ✅ |
| Verification webhook | ✅ |
| Agreement signing | ✅ |
| KYC approval | ✅ |

---

## KYC / Customer Approval Flow

```text
Registration
     ↓
Customer Profile
     ↓
KYC Information
     ↓
Identity Verification
     ↓
Agreement
     ↓
KYC Review
     ↓
 ┌───────────────┐
 │    Decision   │
 └───────┬───────┘
         │
    ┌────┴────┐
    ↓         ↓
 APPROVED   REJECTED
```

---

## Access & Business Rules

- [x] Authentication required for protected KYC operations
- [x] Customer ownership validation
- [x] Inactive customer validation
- [x] KYC status tracking
- [x] Protected KYC operations

---

## Production TODO

- [ ] Final KYC security review
- [ ] KYC document access/security review
- [ ] KYC audit logging
- [ ] Customer approval audit logging
- [ ] Verification webhook security review
- [ ] Webhook replay protection review
- [ ] AML/compliance integration
- [ ] KYC document retention policy
- [ ] Production review of KYC state transitions

---

# 💼 5. Trading Accounts

## Overview

Trading Accounts represent customer trading balances and are used by deposits, withdrawals, and internal transfers.

---

## Implemented

- [x] Trading account model
- [x] Account creation
- [x] Get account
- [x] Account number
- [x] Account currency
- [x] Account status
- [x] Account balance
- [x] Reserved balance
- [x] Customer ownership validation
- [x] Active account validation

---

## API Coverage

| Feature | Status |
|---|---|
| Add account | ✅ |
| Get account | ✅ |
| Get customer accounts | ✅ |

---

## Balance Model

```text
Account Balance
      │
      ├── Balance
      │
      └── Reserved Balance
```

Available funds are determined using the account balance while protecting funds already reserved for pending financial operations.

---

## Future Integration

- [ ] MT5 account creation
- [ ] MT5 account synchronization
- [ ] MT5 balance synchronization
- [ ] MT5 account status synchronization

---

# 💰 6. Funds

## Overview

The Funds module manages customer money movement.

It currently supports:

```text
Funds
├── Deposit
├── Withdrawal
├── Transfer
├── Exchange Rate
└── Transaction History
```

All operations are recorded using the shared `FundTransaction` model.

---

# 💳 6.1 Deposit

## Deposit Flow

```text
Customer
   ↓
Select Trading Account
   ↓
Enter Deposit Amount
   ↓
FX Conversion (if required)
   ↓
FundTransaction
   ↓
PaymentAttempt
   ↓
Stripe Checkout
   ↓
Payment
   ↓
Payment Confirmation
```

---

## Implemented

- [x] Create deposit
- [x] Trading account ownership validation
- [x] Active trading account validation
- [x] Deposit amount validation
- [x] Deposit currency handling
- [x] FX conversion
- [x] Exchange-rate storage
- [x] Exchange-rate source storage
- [x] Converted amount storage
- [x] FundTransaction creation
- [x] PaymentAttempt creation
- [x] Stripe Checkout integration
- [x] PSP reference storage
- [x] Deposit status handling
- [x] Deposit idempotency

---

## Idempotency

Deposit creation is protected using an `Idempotency-Key`.

```text
Request
   ↓
Idempotency-Key
   ↓
Request Hash
   ↓
Already Exists?
   │
   ├── NO → Create Deposit
   │
   └── YES
        ↓
   Same Request?
      │
      ├── YES → Return Existing Deposit
      └── NO  → 409 Conflict
```

This prevents accidental duplicate deposit requests caused by retries or repeated client requests.

---

## Deposit TODO

- [ ] Final Stripe webhook security review
- [ ] Stripe webhook signature verification review
- [ ] Webhook idempotency
- [ ] Duplicate Stripe event protection
- [ ] Ensure successful payment credits balance only once
- [ ] MT5 funding after successful deposit
- [ ] Deposit reconciliation

---

# 💸 6.2 Withdrawal

## Withdrawal Flow

```text
Customer
   ↓
Withdrawal Request
   ↓
Validate Available Balance
   ↓
Reserve Funds
   ↓
Calculate USD Equivalent
   ↓
Approval Required?
   │
   ├── NO
   │    ↓
   │  Ready for Processing
   │
   └── YES
        ↓
     Admin Review
      ↙       ↘
 APPROVE     REJECT
    ↓           ↓
Process      Release
Payout       Reserved Funds
```

---

## Implemented

- [x] Customer withdrawal request
- [x] Customer cannot select payout provider
- [x] Trading account ownership validation
- [x] Active account validation
- [x] Available balance validation
- [x] Reserved balance handling
- [x] FundTransaction creation
- [x] FX conversion
- [x] Exchange-rate storage
- [x] USD-equivalent approval calculation
- [x] Withdrawal approval workflow
- [x] Admin approval
- [x] Admin rejection
- [x] Rejected withdrawal handling
- [x] Admin selects payout provider
- [x] PayoutAttempt creation
- [x] Withdrawal idempotency

---

## Approval Rule

Current business rule:

```text
Withdrawal <= $100 USD equivalent
        ↓
Approval NOT required

Withdrawal > $100 USD equivalent
        ↓
Admin approval REQUIRED
```

---

## Withdrawal States

```text
PENDING
   ↓
Approval Required?
   │
   ├── APPROVED
   │      ↓
   │   Processing
   │
   └── REJECTED
```

---

## Withdrawal TODO

- [ ] Real payout provider integration
- [ ] Real PSP payout confirmation
- [ ] Final balance settlement after payout confirmation
- [ ] Reserved balance settlement after successful payout
- [ ] Failed payout recovery
- [ ] Withdrawal reconciliation
- [ ] MT5 withdrawal integration

---

# 🔁 6.3 Internal Transfer

## Transfer Flow

```text
Source Account
      ↓
Validate Ownership
      ↓
Validate Available Balance
      ↓
Check Destination
      ↓
Same Currency?
   ↙          ↘
 YES          NO
 ↓             ↓
1:1        FX Conversion
   \           /
    \         /
     ↓       ↓
Atomic Database Transaction
        ↓
Debit Source
        +
Credit Destination
        ↓
COMPLETED
```

---

## Implemented

- [x] Account-to-account transfer
- [x] Source account ownership validation
- [x] Destination account ownership validation
- [x] Same-account protection
- [x] Source account status validation
- [x] Destination account status validation
- [x] Available balance validation
- [x] Reserved balance protection
- [x] Same-currency transfer
- [x] Cross-currency transfer
- [x] FX conversion
- [x] Exchange-rate storage
- [x] Atomic source debit
- [x] Atomic destination credit
- [x] Serializable database transaction
- [x] FundTransaction creation
- [x] Transfer completion tracking
- [x] Transfer idempotency

---

# 💱 6.4 Exchange Rates

## Implemented

- [x] Exchange-rate API
- [x] Cross-currency conversion
- [x] Historical rate stored with financial transaction
- [x] Exchange-rate source stored
- [x] Same-currency internal rate handling
- [x] Decimal-based FX calculations

Current external FX source used by the Funds flow:

```text
FRANKFURTER
```

Same-currency operations use:

```text
exchangeRate = 1
exchangeRateSource = INTERNAL
```

---

# 📜 6.5 Transaction History

## Overview

Deposit, withdrawal, and transfer operations use the common `FundTransaction` ledger, allowing them to be queried through a unified transaction-history API.

---

## Implemented

- [x] Customer transaction history
- [x] Deposit transactions
- [x] Withdrawal transactions
- [x] Transfer transactions
- [x] Pagination
- [x] Filtering
- [x] Transaction type filtering
- [x] Customer isolation
- [x] Transaction references
- [x] Original amount/currency
- [x] Converted amount/currency
- [x] Exchange-rate information
- [x] Transaction status

---

## Response Structure

```text
page
pageSize
dataCount
pageCount
pageData[]
```

---

# 🛡️ 7. Funds Security

## Implemented

- [x] Authentication required
- [x] Customer isolation
- [x] Account ownership validation
- [x] Active account validation
- [x] Admin authorization for administrative withdrawal operations
- [x] Decimal-based money calculations
- [x] Atomic financial database transactions
- [x] Available balance validation
- [x] Reserved balance protection
- [x] Deposit idempotency
- [x] Withdrawal idempotency
- [x] Transfer idempotency

---

## Idempotency Coverage

| Financial Operation | Protected |
|---|---|
| Deposit | ✅ |
| Withdrawal | ✅ |
| Transfer | ✅ |

Idempotency protects financial endpoints against duplicate client requests and retries.

---

## Production Security TODO

These features are intentionally postponed until the production-hardening phase.

- [ ] Stripe webhook security review
- [ ] Webhook duplicate-event protection
- [ ] API rate limiting
- [ ] Financial audit logging
- [ ] Daily transaction limits
- [ ] Deposit limits
- [ ] Withdrawal limits
- [ ] Transfer limits
- [ ] Velocity checks
- [ ] Fraud detection
- [ ] AML/compliance controls
- [ ] Reconciliation jobs
- [ ] Monitoring
- [ ] Financial alerts
- [ ] Final transaction state-machine review
- [ ] Production authorization review

---

# 💳 8. Payment / PSP

## Current Integration

- [x] Payment attempt architecture
- [x] Generic payment provider architecture
- [x] Stripe deposit integration
- [x] Provider reference storage
- [x] Payment status tracking

---

## Future

```text
Payment Provider Layer
        │
        ├── Stripe
        ├── Fatoora
        ├── Skrill
        └── Future PSPs
```

- [ ] Additional deposit providers
- [ ] Real withdrawal provider
- [ ] Provider failover strategy
- [ ] PSP reconciliation
- [ ] Provider monitoring

---

# 🔌 9. External Integrations

## Current

| Integration | Purpose | Status |
|---|---|---|
| Stripe | Deposit payments | 🟢 |
| Frankfurter | FX rates | 🟢 |

---

## Future

| Integration | Purpose | Status |
|---|---|---|
| MT5 Manager | Trading account management | 🟡 Later |
| MT5 Funding | Deposit to MT5 | 🟡 Later |
| MT5 Withdrawal | Remove funds from MT5 | 🟡 Later |
| Withdrawal PSP | Customer payouts | 🟡 Later |
| AML Provider | Compliance | 🟡 Later |

---

# 🖥️ 10. MT5 Integration

MT5 Manager integration is intentionally postponed because Manager API access is not currently available.

## Planned Deposit Flow

```text
Stripe Payment
      ↓
Payment Confirmed
      ↓
FundTransaction COMPLETED
      ↓
MT5 Funding Service
      ↓
Deposit Into MT5 Account
      ↓
Record MT5 Reference
```

---

## Planned Withdrawal Flow

```text
Withdrawal Approved
      ↓
MT5 Withdrawal
      ↓
PSP Payout
      ↓
PSP Confirmation
      ↓
Finalize Internal Balance
      ↓
COMPLETED
```

---

## TODO

- [ ] MT5 Manager connection
- [ ] MT5 account creation
- [ ] MT5 account synchronization
- [ ] MT5 deposit
- [ ] MT5 withdrawal
- [ ] MT5 transaction reference storage
- [ ] Retry strategy
- [ ] MT5 reconciliation

---

# 🧰 11. Miscellaneous

## Implemented

- [x] IP information endpoint

---

# 🧪 12. Testing

## Current

- [x] Manual API testing through Postman
- [x] Authentication flow testing
- [x] KYC flow testing
- [x] Account flow testing
- [x] Deposit flow testing
- [x] Withdrawal flow testing
- [x] Withdrawal approval testing
- [x] Withdrawal rejection testing
- [x] Transfer testing
- [x] Cross-currency transfer testing
- [x] Transaction filtering testing
- [x] Idempotency testing

---

## Later

- [ ] Unit tests
- [ ] Integration tests
- [ ] Financial transaction tests
- [ ] Concurrency tests
- [ ] Idempotency concurrency tests
- [ ] Webhook tests
- [ ] Authorization tests
- [ ] Security tests
- [ ] End-to-end tests

---

# 📚 13. Documentation

## Current

- [x] `PROJECT_STATUS.md`

---

## Planned Documentation

```text
docs/
├── PROJECT_STATUS.md
├── PRD.md
├── ARCHITECTURE.md
├── DATABASE.md
├── API.md
├── SECURITY.md
├── BUSINESS_RULES.md
├── INTEGRATIONS.md
└── DEPLOYMENT.md
```

### TODO

- [ ] Product requirements
- [ ] System architecture
- [ ] Database architecture
- [ ] Complete API reference
- [ ] Authentication documentation
- [ ] KYC documentation
- [ ] Funds documentation
- [ ] Security documentation
- [ ] Business rules
- [ ] Stripe integration documentation
- [ ] MT5 integration documentation
- [ ] Deployment documentation
- [ ] Improve login rate limiting
  - [ ] Account/email-based failed-login protection
  - [ ] Keep broader IP-based abuse protection
  - [ ] Reset account failure counter after successful login
  - [ ] Review thresholds for shared IP/VPN users

---

# 🚧 14. Production Hardening

Before production release, perform a dedicated hardening phase.

### Security

- [ ] Authentication security review
- [ ] Authorization review
- [ ] Rate limiting
- [ ] Webhook security
- [ ] Input validation review
- [ ] Sensitive data review
- [ ] Secrets/environment review

### Financial Safety

- [ ] Transaction state-machine review
- [ ] Concurrent balance-operation review
- [ ] Reconciliation
- [ ] Audit logging
- [ ] Transaction limits
- [ ] Fraud controls
- [ ] AML controls

### Operations

- [ ] Application monitoring
- [ ] Error monitoring
- [ ] Financial alerts
- [ ] PSP monitoring
- [ ] Database backup strategy
- [ ] Recovery strategy

---

# 🗺️ Development Roadmap

```text
Authentication
      ✅
      ↓
Customer / Profile
      ✅
      ↓
KYC
      ✅
      ↓
Trading Accounts
      ✅
      ↓
Funds V1
      ✅
      ↓
NEXT CORE MODULE
      ↓
MT5 / PSP Integrations
      ↓
Automated Testing
      ↓
Security Hardening
      ↓
Full Documentation
      ↓
Production Readiness
```

---

# 📌 Current Development Position

## Completed Core Areas

```text
✅ Authentication
✅ Customer
✅ Profile
✅ KYC
✅ Trading Accounts
✅ Deposit
✅ Withdrawal
✅ Withdrawal Approval / Rejection
✅ Transfer
✅ FX Conversion
✅ Transaction History
✅ Financial Idempotency
```

## Intentionally Deferred

```text
⏳ MT5 Manager integration
⏳ Real withdrawal PSP
⏳ Stripe webhook hardening
⏳ AML / fraud controls
⏳ Reconciliation
⏳ Monitoring
⏳ Automated test suite
⏳ Full documentation
⏳ Production security hardening
```

---

# 📝 Maintenance Rule

Update this document whenever a meaningful feature or module is completed.

Use:

```text
[x] = implemented and tested
[ ] = pending / planned
```

Do not mark a feature complete only because it is planned.

The application code, Prisma schema, routes, controllers, services, validation schemas, middleware, and integrations remain the final source of truth.

Before production, this tracker must be reviewed against the actual codebase.

---

**Last updated:** October 2026