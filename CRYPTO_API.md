# Crypto API

## Save a quote

POST `http://localhost:3001/api/crypto/saveCrypto`, Content-Type: application/json:

```json
{
  "symbol": "BTCUSDT",
  "buyPrice": "60001.50",
  "spread": "1.50",
  "price": "60000.00",
  "changePercent": "2.35",
  "high": "61500.00",
  "low": "58000.00"
}
```

Illustrative values only. Each save updates the symbol's latest quote and appends a timestamped price-history record atomically. Decimal values are returned as strings to preserve precision. Send all quote fields on each save. Buy price, spread, change percentage, high and low are supplied values, not calculated by this app; use a consistent quote currency and measurement period in your data source.

## Fetch saved quotes

POST `http://localhost:3001/api/crypto/getAllCrypto` returns `{ statusCode: 100, message: "Data fetched successfully", data: [...] }`.

Each item contains the quote fields, `updatedAt`, and `past30Min`: an array of `{ price, recordedAt }` from the preceding 30 minutes. History begins when quotes are submitted; old samples remain stored but are excluded from this response.

## WebSocket

Connect to `ws://localhost:3001/ws/crypto`. No request message is necessary. The server sends a snapshot immediately and after committed changes to either crypto table:

```js
const socket = new WebSocket('ws://localhost:3001/ws/crypto');
socket.onmessage = event => {
  const result = JSON.parse(event.data);
  if (result.type === 'crypto.snapshot') console.log(result.data);
};
```

Messages use `{ type: "crypto.snapshot", statusCode: 100, message: "Data fetched successfully", data: [...] }`. PostgreSQL LISTEN/NOTIFY triggers detect changes from the API, Prisma Studio, or direct SQL. Unchanged snapshots are suppressed. Customer-table changes do not refresh this crypto feed. The 30-minute window is recalculated on connection or data changes; passage of time alone does not emit a message. Database failures produce `crypto.error` messages, and the listener reconnects automatically. Reconnect from the frontend after a disconnect.

This implementation streams saved database values. It does not fetch market prices automatically: a provider integration is still needed to populate quotes automatically. No sample market prices are seeded. The write endpoint currently follows this starter's unauthenticated API setup; restrict it to trusted ingestion before exposing it publicly.

WebSocket implementation: [ws documentation](https://github.com/websockets/ws).

## Verification

Use Node 22 (`nvm use`). Run `npm run typecheck`, `node --import tsx --test tests/crypto.test.ts`, and optionally `node --import tsx tests/crypto.integration.ts`. The integration check uses the configured database and a temporary test symbol, then removes only its own records.
