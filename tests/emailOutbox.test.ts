import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEmailRedisConnection } from '../src/config/bullmq.config.js';
import prisma from '../src/db/db.config.js';
import { createEmailOutboxEvent } from '../src/jobs/services/emailOutbox.service.js';
import { claimEmailOutboxEvent, markEmailOutboxSent, markEmailOutboxFailed } from '../src/jobs/services/emailOutbox.processor.js';

test('BullMQ preserves local-only guard and producer/worker retry settings', () => {
  const previous = { url: process.env.BULLMQ_REDIS_URL, mode: process.env.NODE_ENV };
  try {
    process.env.NODE_ENV = 'test';
    process.env.BULLMQ_REDIS_URL = 'redis://127.0.0.1:6379';
    assert.equal(getEmailRedisConnection().maxRetriesPerRequest, 1);
    assert.equal(getEmailRedisConnection(true).maxRetriesPerRequest, null);
    process.env.NODE_ENV = 'production';
    assert.throws(() => getEmailRedisConnection(), /not configured yet/);
    process.env.NODE_ENV = 'test';
    process.env.BULLMQ_REDIS_URL = 'redis://example.invalid:6379';
    assert.throws(() => getEmailRedisConnection(), /local Docker Redis/);
    delete process.env.BULLMQ_REDIS_URL;
    assert.throws(() => getEmailRedisConnection(), /required/);
  } finally {
    if (previous.url === undefined) delete process.env.BULLMQ_REDIS_URL;
    else process.env.BULLMQ_REDIS_URL = previous.url;
    if (previous.mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.mode;
  }
});

test('outbox creation uses the supplied transaction and never resets an existing event', async () => {
  let args: any;
  const tx = { emailOutbox: { upsert: async (value: any) => { args = value; return { id: 'event' }; } } };
  await createEmailOutboxEvent(tx as any, { eventKey: 'auth:welcome:user', type: 'welcome-email', userId: 'user' });
  assert.deepEqual(args.where, { eventKey: 'auth:welcome:user' });
  assert.deepEqual(args.update, {});
  assert.equal(args.create.status, 'PENDING');
});

test('claims are exclusive, token-owned, and FAILED/SENT events cannot be reclaimed', async () => {
  const original = prisma.emailOutbox.updateMany;
  let state: any = { id: 'event', status: 'PENDING', claimToken: null, attempts: 0 };
  (prisma.emailOutbox as any).updateMany = async ({ where, data }: any) => {
    if (where.id !== state.id || where.status !== state.status || where.claimToken !== state.claimToken) return { count: 0 };
    state = { ...state, ...data, attempts: data.attempts ? state.attempts + data.attempts.increment : state.attempts };
    return { count: 1 };
  };
  try {
    const claim = await claimEmailOutboxEvent('event');
    assert(claim);
    assert.equal(state.status, 'PROCESSING');
    assert.equal(state.attempts, 1);
    assert(state.lockedUntil > new Date());
    assert.equal(await claimEmailOutboxEvent('event'), null);
    assert.equal(await markEmailOutboxSent({ ...claim, claimToken: 'wrong' }), false);
    assert.equal(await markEmailOutboxFailed({ ...claim, claimToken: 'wrong' }, new Error('test')), false);
    assert.equal(await markEmailOutboxSent(claim), true);
    assert.equal(state.status, 'SENT');
    assert.equal(await claimEmailOutboxEvent('event'), null);
    state = { id: 'event', status: 'PENDING', claimToken: null, attempts: 0 };
    const failedClaim = await claimEmailOutboxEvent('event');
    assert(failedClaim);
    assert.equal(await markEmailOutboxFailed(failedClaim, new Error('uncertain delivery')), true);
    assert.equal(state.status, 'FAILED');
    assert.equal(await claimEmailOutboxEvent('event'), null);
  } finally { prisma.emailOutbox.updateMany = original; }
});
