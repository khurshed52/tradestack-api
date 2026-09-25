import { test } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/db/db.config.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { updateCustomer } from '../src/modules/customer/customer.controller.js';

test('customer email uses the linked user and atomic writes; other updates remain unchanged', async () => {
  const originals = [prisma.customer.findFirst, prisma.user.findFirst, prisma.customer.update, prisma.$transaction] as const;
  const id = '11111111-1111-4111-8111-111111111111';
  const customer = { id, userId: 'linked-user', email: 'old@example.com' };
  let duplicate = '';
  let failure = '';
  let transactions = 0;
  let directUpdates = 0;
  let writes: any[] = [];
  (prisma.customer as any).findFirst = async ({ where }: any) => {
    if (where.isActive) return customer;
    assert.equal(where.id.not, id);
    return duplicate === 'customer' ? { id: 'other' } : null;
  };
  (prisma.user as any).findFirst = async ({ where }: any) => {
    assert.equal(where.id.not, customer.userId);
    return duplicate === 'user' ? { id: 'other' } : null;
  };
  (prisma.customer as any).update = async ({ data }: any) => {
    directUpdates++;
    return { ...customer, ...data };
  };
  (prisma as any).$transaction = async (callback: any) => {
    transactions++;
    writes = [];
    return callback({
      user: { update: async (args: any) => {
        writes.push(['user', args]);
        if (failure === 'user') throw new Prisma.PrismaClientKnownRequestError('internal', { code: 'P2002', clientVersion: '7' });
      } },
      customer: { update: async (args: any) => {
        writes.push(['customer', args]);
        if (failure === 'customer') throw new Prisma.PrismaClientKnownRequestError('internal', { code: 'P2002', clientVersion: '7' });
        return { ...customer, ...args.data };
      } },
    });
  };
  const invoke = async (body: any) => {
    let status = 200;
    let response: any;
    const res = { status(value: number) { status = value; return this; }, json(value: any) { response = value; return this; } };
    await updateCustomer({ body: { id, ...body }, user: { id: customer.userId, role: "USER" } } as any, res as any);
    return { status, response };
  };
  try {
    for (const email of [' NEW@Example.com ', 'old@example.com']) {
      const { status, response } = await invoke({ email });
      assert.equal(status, 200);
      assert.equal(response.data.email, email.trim().toLowerCase());
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[0][1], { where: { id: customer.userId }, data: { email: email.trim().toLowerCase() } });
      assert.equal(writes[1][1].data.email, email.trim().toLowerCase());
    }
    const count = transactions;
    assert.equal((await invoke({ customerFirstName: ' New ' })).status, 200);
    assert.equal(transactions, count);
    assert.equal(directUpdates, 1);
    for (const table of ['user', 'customer']) {
      duplicate = table;
      assert.deepEqual(await invoke({ email: 'taken@example.com' }), {
        status: 409, response: { statusCode: 409, message: 'Email already exists', data: null },
      });
    }
    assert.equal(transactions, count);
    duplicate = '';
    for (const table of ['user', 'customer']) {
      failure = table;
      const result = await invoke({ email: 'race@example.com' });
      assert.equal(result.status, 409);
      assert.equal(result.response.data, null);
      assert(!JSON.stringify(result).includes('internal'));
      assert.equal(writes.length, table === 'user' ? 1 : 2);
    }
    assert.equal((await invoke({ email: 'new@example.com', userId: 'untrusted' })).status, 400);
  } finally {
    [prisma.customer.findFirst, prisma.user.findFirst, prisma.customer.update, prisma.$transaction] = originals;
  }
});
