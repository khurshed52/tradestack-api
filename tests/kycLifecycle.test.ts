import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import sgMail from '@sendgrid/mail';
import prisma from '../src/db/db.config.js';
import { updateMyKycProfile, startIdentityVerification, signKycAgreement } from '../src/modules/kyc/kyc.controller.js';
import { reviewKyc } from '../src/modules/kyc/adminKyc.controller.js';
import { veriffWebhook } from '../src/modules/kyc/veriffWebhook.controller.js';

const id = '00000000-0000-4000-8000-000000000001';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const profileBody = { dateOfBirth: '1990-01-01', gender: 'MALE', countryOfResidence: 'AE', addressLine1: 'Test', city: 'Test', state: 'Test', postalCode: '00000', employmentStatus: 'EMPLOYED', occupation: 'Test' };

// Controller tests with serialized, rollback-capable transaction doubles.
// No external HTTP, email or database writes are made.
async function fixture(status: string, run: (f: any) => Promise<void>) {
  let state: any = { status, profile: { id: 'profile', customerId: id, providerSessionId: 'session', providerSessionUrl: 'https://veriff.invalid/old-session', profileCompletedAt: new Date('2025-01-01') }, agreement: null, accounts: [] };
  const paths: string[] = [];
  const originals = { find: prisma.customer.findUnique, profile: prisma.kycProfile.findUnique, transaction: prisma.$transaction, fetch: globalThis.fetch, send: sgMail.send };
  const env = { ...process.env };
  process.env.VERIFF_BASE_URL = 'https://veriff.invalid';
  process.env.VERIFF_API_KEY = 'test-key';
  process.env.VERIFF_SHARED_SECRET = 'test-secret';
  let staleStatus: string | undefined;
  let sessionBeforeClaim: string | undefined;
  let failAccount = false;
  let fetchCalls = 0;
  let transactionCalls = 0;
  let queue = Promise.resolve();
  const customer = () => ({ id, userId: 'user', status: state.status, isActive: true, customerFirstName: 'Test', customerLastName: 'Customer', email: 'test@example.com', kycProfile: structuredClone(state.profile), kycAgreement: state.agreement });
  (prisma.customer as any).findUnique = async () => customer();
  (prisma.kycProfile as any).findUnique = async () => ({ id: 'profile', customerId: id });
  globalThis.fetch = (async () => { fetchCalls++; return { ok: true, json: async () => ({ verification: { id: 'new-session', url: 'https://veriff.invalid/session' } }) }; }) as any;
  sgMail.send = (async () => []) as any;
  (prisma as any).$transaction = async (callback: any) => {
    transactionCalls++;
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    if (staleStatus) { state.status = staleStatus; staleStatus = undefined; }
    if (sessionBeforeClaim) { state.profile.providerSessionId = sessionBeforeClaim; sessionBeforeClaim = undefined; }
    const snapshot = structuredClone(state);
    try {
      return await callback({
        customer: { updateMany: async ({ where, data }: any) => {
          assert.equal(where.id, id);
          if (state.status !== where.status) return { count: 0 };
          state.status = data.status;
          return { count: 1 };
        } },
        kycProfile: {
          findUnique: async () => structuredClone(state.profile),
          upsert: async ({ update }: any) => (state.profile = { ...state.profile, ...update }),
          update: async ({ data }: any) => (state.profile = { ...state.profile, ...data }),
        },
        kycAgreement: { create: async ({ data }: any) => {
          assert.equal(state.agreement, null);
          paths.push(data.documentPath);
          return state.agreement = { id: 'agreement', ...data };
        } },
        tradingAccount: {
          count: async () => state.accounts.length,
          findUnique: async () => null,
          create: async ({ data }: any) => {
            if (failAccount) throw new Error('Test account failure');
            const account = { id: 'account', ...data }; state.accounts.push(account); return account;
          },
        },
      });
    } catch (error) { state = snapshot; throw error; }
    finally { release(); }
  };
  const call = async (handler: any, body: any = {}) => {
    let code = 0; let result: any;
    await handler({ user: { id: 'user', role: 'ADMIN' }, params: { customerId: id }, body, get: () => 'test' }, {
      status(n: number) { code = n; return this; }, json(value: any) { result = value; return this; },
    });
    return { code, body: result };
  };
  const webhook = async (decision: string) => {
    const body = Buffer.from(JSON.stringify({ verification: { id: 'session', status: decision } }));
    let code = 0;
    await veriffWebhook({ body, header: (key: string) => key === 'x-auth-client' ? 'test-key' : crypto.createHmac('sha256', 'test-secret').update(body).digest('hex') } as any,
      { status(n: number) { code = n; return this; }, json() { return this; } } as any);
    return code;
  };
  try { await run({ call, webhook, fetchCalls: () => fetchCalls, transactionCalls: () => transactionCalls, state: () => state, race: (s: string) => { staleStatus = s; }, staleSession: () => { sessionBeforeClaim = 'new-session'; }, failAccount: () => { failAccount = true; } }); }
  finally {
    prisma.customer.findUnique = originals.find; prisma.kycProfile.findUnique = originals.profile; prisma.$transaction = originals.transaction;
    globalThis.fetch = originals.fetch; sgMail.send = originals.send;
    for (const key of ['VERIFF_BASE_URL', 'VERIFF_API_KEY', 'VERIFF_SHARED_SECRET']) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
    for (const path of paths) await fs.unlink(path).catch(() => {});
  }
}

for (const status of ['REGISTERED', 'PROFILE_COMPLETED', 'IDENTITY_REJECTED']) {
  test(`profile edit from ${status} preserves timestamp and allowed lifecycle`, () => fixture(status, async f => {
    const result = await f.call(updateMyKycProfile, profileBody);
    assert.equal(result.code, 200);
    assert.equal(f.state().status, status === 'REGISTERED' ? 'PROFILE_COMPLETED' : status);
    assert.equal(f.state().profile.profileCompletedAt.toISOString(), '2025-01-01T00:00:00.000Z');
    assert.equal(result.body.data.status, f.state().status);
  }));
}
for (const status of ['IDENTITY_IN_PROGRESS', 'IDENTITY_VERIFIED', 'COMPLETED', 'APPROVED', 'REJECTED', 'IDENTITY_PENDING', 'SIGNATURE_PENDING', 'PROFILE_IN_PROGRESS']) {
  test(`profile rejects ${status}`, () => fixture(status, async f => {
    assert.equal((await f.call(updateMyKycProfile, profileBody)).code, 409); assert.equal(f.state().status, status);
  }));
}
for (const status of ['PROFILE_COMPLETED', 'IDENTITY_REJECTED']) {
  test(`identity starts from ${status}`, () => fixture(status, async f => {
    const result = await f.call(startIdentityVerification);
    assert.equal(result.code, 200);
    assert.equal(result.body.data.verificationUrl, 'https://veriff.invalid/session');
    assert.equal(f.state().profile.providerSessionUrl, 'https://veriff.invalid/session');
    assert.equal(f.fetchCalls(), 1);
    assert.equal(f.state().status, 'IDENTITY_IN_PROGRESS'); assert.equal(f.state().profile.providerSessionId, 'new-session');
  }));
}
for (const status of ['IDENTITY_PENDING', 'IDENTITY_VERIFIED', 'APPROVED', 'REJECTED', 'COMPLETED', 'SIGNATURE_PENDING', 'PROFILE_IN_PROGRESS']) {
  test(`identity rejects ${status}`, () => fixture(status, async f => { assert.equal((await f.call(startIdentityVerification)).code, 409); assert.equal(f.fetchCalls(), 0); assert.equal(f.transactionCalls(), 0); assert.equal(f.state().status, status); }));
}
for (const status of ['IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'COMPLETED', 'APPROVED', 'REJECTED']) {
  test(`all delayed callbacks preserve ${status}`, () => fixture(status, async f => {
    const before = structuredClone(f.state());
    for (const decision of ['approved', 'declined', 'expired', 'abandoned', 'review', 'resubmission_requested']) {
      assert.equal(await f.webhook(decision), 200); assert.deepEqual(f.state(), before);
    }
  }));
}
for (const decision of ['approved', 'declined', 'expired', 'abandoned', 'review', 'resubmission_requested']) {
  test(`active callback ${decision}`, () => fixture('IDENTITY_IN_PROGRESS', async f => {
    assert.equal(await f.webhook(decision), 200);
    assert.equal(f.state().profile.providerSessionId, 'session');
    assert.equal(f.state().profile.providerSessionUrl, 'https://veriff.invalid/old-session');
    assert.equal(f.state().status, decision === 'approved' ? 'IDENTITY_VERIFIED' : ['review', 'resubmission_requested'].includes(decision) ? 'IDENTITY_IN_PROGRESS' : 'IDENTITY_REJECTED');
  }));
}
test('old session recheck rolls back lifecycle claim', () => fixture('IDENTITY_IN_PROGRESS', async f => {
  f.staleSession(); assert.equal(await f.webhook('approved'), 200); assert.equal(f.state().status, 'IDENTITY_IN_PROGRESS');
}));
test('profile race does not overwrite approval or profile data', () => fixture('PROFILE_COMPLETED', async f => {
  f.race('APPROVED'); assert.equal((await f.call(updateMyKycProfile, profileBody)).code, 409); assert.equal(f.state().profile.city, undefined);
}));
test('identity race does not replace session', () => fixture('PROFILE_COMPLETED', async f => {
  f.race('IDENTITY_IN_PROGRESS'); assert.equal((await f.call(startIdentityVerification)).code, 409); assert.equal(f.state().profile.providerSessionId, 'session');
}));
test('signing creates PDF and atomically completes KYC', () => fixture('IDENTITY_VERIFIED', async f => {
  assert.equal((await f.call(signKycAgreement, { accepted: true, documentVersion: 'terms-v1', signature: png })).code, 200);
  assert.equal(f.state().status, 'COMPLETED'); assert(f.state().agreement); assert(f.state().profile.completedAt);
}));
for (const decision of ['APPROVED', 'REJECTED']) {
  test(`admin ${decision} from COMPLETED`, () => fixture('COMPLETED', async f => {
    assert.equal((await f.call(reviewKyc, { decision })).code, 200); assert.equal(f.state().status, decision);
    assert.equal(f.state().accounts.length, decision === 'APPROVED' ? 1 : 0);
  }));
  test(`terminal ${decision} cannot be signed or reviewed again`, () => fixture(decision, async f => {
    assert.equal((await f.call(signKycAgreement, { accepted: true, documentVersion: 'terms-v1', signature: png })).code, 409);
    for (const next of ['APPROVED', 'REJECTED']) assert.equal((await f.call(reviewKyc, { decision: next })).code, 409);
    assert.equal(f.state().status, decision);
  }));
}
test('concurrent admin approval and rejection have one winner', () => fixture('COMPLETED', async f => {
  const results = await Promise.all([f.call(reviewKyc, { decision: 'APPROVED' }), f.call(reviewKyc, { decision: 'REJECTED' })]);
  assert.deepEqual(results.map(r => r.code).sort(), [200, 409]); assert.equal(f.state().accounts.length, 1);
}));
test('approval claim rolls back when account creation fails', () => fixture('COMPLETED', async f => {
  f.failAccount(); assert.equal((await f.call(reviewKyc, { decision: 'APPROVED' })).code, 500); assert.equal(f.state().status, 'COMPLETED');
}));
test('first profile completion sets its timestamp once', () => fixture('REGISTERED', async f => {
  f.state().profile.profileCompletedAt = null;
  assert.equal((await f.call(updateMyKycProfile, profileBody)).code, 200);
  const first = f.state().profile.profileCompletedAt.getTime();
  assert.equal((await f.call(updateMyKycProfile, profileBody)).code, 200);
  assert.equal(f.state().profile.profileCompletedAt.getTime(), first);
}));
test('concurrent signings have one winner and preserve its PDF', () => fixture('IDENTITY_VERIFIED', async f => {
  const body = { accepted: true, documentVersion: 'terms-v1', signature: png };
  const results = await Promise.all([f.call(signKycAgreement, body), f.call(signKycAgreement, body)]);
  assert.deepEqual(results.map(r => r.code).sort(), [200, 409]);
  assert.equal(f.state().status, 'COMPLETED');
  assert((await fs.stat(f.state().agreement.documentPath)).size > 0);
}));
test('signing race cannot overwrite APPROVED and cleans orphan PDF', () => fixture('IDENTITY_VERIFIED', async f => {
  const before = (await fs.readdir('storage/kyc/signed')).filter(name => name.startsWith(id)).sort();
  f.race('APPROVED');
  assert.equal((await f.call(signKycAgreement, { accepted: true, documentVersion: 'terms-v1', signature: png })).code, 409);
  assert.equal(f.state().status, 'APPROVED'); assert.equal(f.state().agreement, null);
  assert.deepEqual((await fs.readdir('storage/kyc/signed')).filter(name => name.startsWith(id)).sort(), before);
}));

test('identity resume returns the same URL without external calls or mutations', () => fixture('IDENTITY_IN_PROGRESS', async f => {
  const before = structuredClone(f.state());
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await f.call(startIdentityVerification);
    assert.equal(result.code, 200);
    assert.deepEqual(result.body, { statusCode: 200, message: 'Identity verification resumed successfully', data: { verificationUrl: before.profile.providerSessionUrl } });
  }
  assert.equal(f.fetchCalls(), 0);
  assert.equal(f.transactionCalls(), 0);
  assert.deepEqual(f.state(), before);
}));
for (const field of ['providerSessionUrl', 'providerSessionId']) {
  test(`identity resume with missing ${field} returns conflict without creating a session`, () => fixture('IDENTITY_IN_PROGRESS', async f => {
    f.state().profile[field] = null;
    const before = structuredClone(f.state());
    const result = await f.call(startIdentityVerification);
    assert.equal(result.code, 409);
    assert.match(result.body.message, /existing identity session cannot be resumed/);
    assert.equal(f.fetchCalls(), 0);
    assert.equal(f.transactionCalls(), 0);
    assert.deepEqual(f.state(), before);
  }));
}
test('REGISTERED must complete profile before identity', () => fixture('REGISTERED', async f => {
  const result = await f.call(startIdentityVerification);
  assert.equal(result.code, 400);
  assert.equal(result.body.message, 'Complete your KYC profile first');
  assert.equal(f.fetchCalls(), 0);
  assert.equal(f.transactionCalls(), 0);
}));
