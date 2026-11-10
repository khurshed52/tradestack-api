import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set inert configuration before imports; never use the configured database.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
const { default: prisma } = await import('../src/db/db.config.js');
const { Prisma } = await import('../src/generated/prisma/client.js');
const { createWithdrawal, enforceWithdrawalPasswordCooldown } = await import('../src/modules/funds/funds.service.js');
const { createIdempotencyRequestHash } = await import('../src/modules/funds/utils/idempotency.js');
const input = { userId: 'user', accountNumber: '123', amount: 10, payoutCurrency: 'USD', idempotencyKey: 'key' };
const day = 24 * 60 * 60 * 1000;

test('helper rejects active cooldown with Date metadata and permits exact expiry', () => {
  const original = Date.now;
  Date.now = () => day * 3;
  try {
    assert.throws(() => enforceWithdrawalPasswordCooldown(new Date(day * 2 + 1)), (error: any) => {
      assert.equal(error.message, 'WITHDRAWAL_PASSWORD_COOLDOWN');
      assert(error.withdrawalAllowedAt instanceof Date);
      assert.equal(error.withdrawalAllowedAt.getTime(), day * 3 + 1);
      return true;
    });
    enforceWithdrawalPasswordCooldown(new Date(day * 2));
    enforceWithdrawalPasswordCooldown(new Date(day));
    enforceWithdrawalPasswordCooldown(null);
  } finally { Date.now = original; }
});

async function fixture(options: { initial: Date | null; current?: Date | null; active?: boolean; replay?: boolean }, run: (state: any) => Promise<void>) {
  const account = { id: 'account', customerId: 'customer', accountNumber: '123', currency: 'USD', status: 'ACTIVE', balance: new Prisma.Decimal(100), reservedBalance: new Prisma.Decimal(0) };
  const state = { writes: 0, transactions: 0, accountReads: 0, userReads: 0 };
  const original = { user: prisma.user.findUnique, key: prisma.idempotencyRequest.findUnique, account: prisma.tradingAccount.findUnique, fund: prisma.fundTransaction.findFirst, tx: prisma.$transaction, notification: prisma.notification.upsert, fetch: globalThis.fetch };
  const hash = createIdempotencyRequestHash({ operation: 'WITHDRAWAL', accountNumber: '123', amount: 10, payoutCurrency: 'USD' });
  const fund = { id: 'fund', reference: 'WDR-original', status: 'PENDING', amount: new Prisma.Decimal(10), currency: 'USD', convertedAmount: new Prisma.Decimal(10), convertedCurrency: 'USD', exchangeRate: new Prisma.Decimal(1), exchangeRateSource: 'INTERNAL', withdrawalApprovalStatus: 'NOT_REQUIRED', account };
  const unexpected = async () => { throw new Error('Unexpected write or network request'); };
  globalThis.fetch = unexpected;
  prisma.user.findUnique = (async () => ({ isActive: true, passwordChangedAt: options.initial, customer: { id: 'customer', isActive: true } })) as any;
  prisma.idempotencyRequest.findUnique = (async () => options.replay ? { requestHash: hash, operation: 'WITHDRAWAL', status: 'COMPLETED', fundTransactionId: 'fund' } : null) as any;
  prisma.tradingAccount.findUnique = (async () => { state.accountReads++; return account; }) as any;
  prisma.fundTransaction.findFirst = (async () => fund) as any;
  prisma.notification.upsert = (async () => ({})) as any;
  prisma.$transaction = (async (callback: any, config: any) => {
    state.transactions++;
    assert.equal(config.isolationLevel, 'Serializable');
    return callback({
      user: { findUnique: async (args: any) => {
        state.userReads++;
        assert.equal(args.where.id, input.userId);
        return { isActive: options.active ?? true, passwordChangedAt: options.current === undefined ? options.initial : options.current };
      } },
      idempotencyRequest: { upsert: async () => ({ id: 'key', requestHash: hash, operation: 'WITHDRAWAL', status: 'PROCESSING' }), update: async () => ({}) },
      tradingAccount: { findUnique: async () => account, update: async () => { state.writes++; return account; } },
      fundTransaction: { create: async () => { state.writes++; return fund; } },
    });
  }) as any;
  try { await run(state); }
  finally {
    prisma.user.findUnique = original.user;
    prisma.idempotencyRequest.findUnique = original.key;
    prisma.tradingAccount.findUnique = original.account;
    prisma.fundTransaction.findFirst = original.fund;
    prisma.$transaction = original.tx;
    prisma.notification.upsert = original.notification;
    globalThis.fetch = original.fetch;
  }
}

test('recent password change rejects before any account access or transaction', async () => {
  await fixture({ initial: new Date() }, async state => {
    await assert.rejects(createWithdrawal(input), /WITHDRAWAL_PASSWORD_COOLDOWN/);
    assert.equal(state.accountReads, 0);
    assert.equal(state.transactions, 0);
    assert.equal(state.writes, 0);
  });
});

for (const [label, initial] of [['expired', new Date(Date.now() - day - 1000)], ['unset', null]] as const) {
  test(`${label} password timestamp allows normal withdrawal processing`, async () => {
    await fixture({ initial }, async state => {
      const result = await createWithdrawal(input);
      assert.equal(result.transactionId, 'fund');
      assert.equal(state.userReads, 1);
      assert.equal(state.writes, 2);
    });
  });
}

test('completed idempotency request replays during cooldown without new writes', async () => {
  await fixture({ initial: new Date(), replay: true }, async state => {
    const result = await createWithdrawal(input);
    assert.equal(result.transactionId, 'fund');
    assert.equal(result.reference, 'WDR-original');
    assert.equal(result.idempotentReplay, true);
    assert.equal(state.transactions, 0);
    assert.equal(state.writes, 0);
  });
});

test('password change between initial read and transaction rejects before financial writes', async () => {
  await fixture({ initial: null, current: new Date() }, async state => {
    await assert.rejects(createWithdrawal(input), /WITHDRAWAL_PASSWORD_COOLDOWN/);
    assert.equal(state.userReads, 1);
    assert.equal(state.transactions, 1);
    assert.equal(state.writes, 0);
  });
});

test('user deactivation between reads rejects before financial writes', async () => {
  await fixture({ initial: null, active: false }, async state => {
    await assert.rejects(createWithdrawal(input), /CUSTOMER_INACTIVE/);
    assert.equal(state.writes, 0);
  });
});
