import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const { default: prisma } = await import('../src/db/db.config.js');
const { executeAiTool } = await import('../src/modules/ai/tools/tool-executor.js');
const { executeMyKycStatus } = await import('../src/modules/ai/tools/kyc.tools.js');

async function fixture(run: (queries: string[]) => Promise<void>) {
  const original = prisma.customer.findUnique;
  const queries: string[] = [];
  const rows: Record<string, any> = {
    registered: { status: 'REGISTERED', kycProfile: null },
    approved: { status: 'APPROVED', kycProfile: { completedAt: new Date() } },
    progress: { status: 'IDENTITY_IN_PROGRESS', kycProfile: { profileCompletedAt: new Date() } },
  };
  prisma.customer.findUnique = (async ({ where }: any) => {
    assert.deepEqual(Object.keys(where), ['userId']);
    queries.push(where.userId);
    const row = rows[where.userId];
    return row ? { ...row, email: 'private@example.invalid', dateOfBirth: 'private', addressLine1: 'private' } : null;
  }) as any;
  try { await run(queries); } finally { prisma.customer.findUnique = original; }
}

for (const [userId, status] of [['registered', 'REGISTERED'], ['approved', 'APPROVED'], ['progress', 'IDENTITY_IN_PROGRESS']]) {
  test(`${status} is resolved by authenticated User ID and returns no personal data`, async () => {
    await fixture(async queries => {
      const result: any = await executeAiTool('get_my_kyc_status', {}, { userId });
      assert.equal(result.status, status);
      assert.equal(result.customerExists, true);
      assert.equal(result.profileExists, true);
      assert.deepEqual(queries, [userId]);
      assert(!JSON.stringify(result).includes('private'));
      if (status === 'REGISTERED') {
        assert.equal(result.kycProfileExists, false);
        assert.equal(result.nextStep, 'Complete your KYC profile.');
      }
      if (status === 'APPROVED') assert.equal(result.nextStep, 'Your KYC has been approved.');
      if (status === 'IDENTITY_IN_PROGRESS') assert.equal(result.profileCompleted, true);
    });
  });
}

test('missing Customer is distinct from REGISTERED without KycProfile', async () => {
  await fixture(async () => {
    const result: any = await executeAiTool('get_my_kyc_status', {}, { userId: 'unlinked' });
    assert.equal(result.status, 'CUSTOMER_PROFILE_NOT_FOUND');
    assert.equal(result.customerExists, false);
    assert.equal(result.kycProfileExists, false);
  });
});

test('unauthenticated execution is rejected before querying', async () => {
  await fixture(async queries => {
    await assert.rejects(executeAiTool('get_my_kyc_status', {}), /AI_AUTH_REQUIRED/);
    await assert.rejects(executeMyKycStatus({}, ''), /AI_AUTH_REQUIRED/);
    assert.deepEqual(queries, []);
  });
});

test('User A cannot request User B through model arguments', async () => {
  await fixture(async queries => {
    await assert.rejects(executeAiTool('get_my_kyc_status', { userId: 'approved' }, { userId: 'registered' }));
    assert.deepEqual(queries, []);
    const result: any = await executeAiTool('get_my_kyc_status', {}, { userId: 'registered' });
    assert.equal(result.status, 'REGISTERED');
    assert.deepEqual(queries, ['registered']);
  });
});
