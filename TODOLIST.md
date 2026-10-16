1. Notification Center — Recommended next
Notify customers when deposits, withdrawals, transfers, or KYC statuses change. Add a notification bell, unread count, and notifications page.
Frontend + Backend · Medium complexity




2. Security & Login Activity
Show recent login sessions, devices, and suspicious login alerts. Add the ability to revoke sessions if your authentication architecture supports it.
Frontend + Backend · Medium–high complexity




3. Transaction Details & Receipts
Let customers open any Funds History transaction to see its reference, timestamps, status, account details, and a downloadable receipt for completed transactions.
Frontend + Backend · Low–medium complexity




4. Support Ticket System
Allow customers to submit questions about payments, accounts, or KYC and track responses from the support team.
Frontend + Backend · Medium complexity




### 5. Trading Dashboard & MT5 Integration (Pending Client Requirements)

Connect actual trading account balances, equity, margin, free margin, open positions, pending orders, and trading history to the TradePro dashboard once MT5 integration is available.

**Requirements needed from the client:**

- **MT5 Broker/Server Details:** Broker name, MT5 server information, and confirmation of whether the client operates an MT5 server or uses a third-party broker.
- **MT5 API Access:** Authorized Manager API access, broker-provided API, or an approved third-party integration provider.
- **Demo/Test Account:** MT5 demo account credentials or a sandbox environment for development and testing.
- **Trading Account Management:** Confirmation of whether TradeStack should create MT5 accounts automatically or link existing accounts.
- **Account Data Access:** Permission to retrieve balances, equity, margin, free margin, floating profit/loss, and account status.
- **Trading Activity Access:** Permission to retrieve open positions, pending orders, closed trades, and trading history.
- **Real-Time Updates:** Confirmation of whether live account updates are supported and the required refresh frequency.
- **Trading Permissions:** Clarification on whether the dashboard is read-only or should also support placing, modifying, and closing trades.
**Status:** Pending MT5 infrastructure, API access, and technical requirements from the client. Implementation will begin once these dependencies are available.