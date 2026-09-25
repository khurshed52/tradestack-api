import { test } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/db/db.config.js';
import { getCustomerDetails, updateCustomer } from '../src/modules/customer/customer.controller.js';
import { updateCustomerSchema } from '../src/modules/customer/customer.validation.js';

 test('customer details and updates enforce database ownership without leaking data', async () => {
  const originals = [prisma.customer.findFirst, prisma.customer.update, prisma.$transaction, prisma.user.findFirst] as const;
  const id = '11111111-1111-4111-8111-111111111111';
  const customer = { id, userId: 'owner', email: 'private@example.com' };
  let exists = true;
  let reads = 0;
  let writes = 0;
  (prisma.customer as any).findFirst = async ({ where }: any) => {
    reads++;
    assert.equal(where.id, id);
    assert.equal(where.isActive, true);
    return exists ? customer : null;
  };
  (prisma.customer as any).update = async ({ data }: any) => { writes++; return { ...customer, ...data }; };
  (prisma as any).$transaction = async () => { throw new Error('Denied email update must not start a transaction'); };
  (prisma.user as any).findFirst = async () => { throw new Error('Denied email update must not query duplicate emails'); };
  const invoke = async (handler: any, user: any, body: any) => {
    let status = 200;
    let response: any;
    const res = { status(value: number) { status = value; return this; }, json(value: any) { response = value; return this; } };
    await handler({ user, body: { id, ...body } }, res);
    return { status, response };
  };
  try {
    for (const handler of [getCustomerDetails, updateCustomer]) {
      const body = handler === updateCustomer ? { customerFirstName: 'Updated' } : {};
      for (const user of [{ id: 'owner', role: 'USER' }, { id: 'admin', role: 'ADMIN' }]) {
        assert.equal((await invoke(handler, user, body)).status, 200);
      }
      for (const user of [{ id: 'other', role: 'USER' }, { id: 'owner', role: 'UNKNOWN' }, undefined]) {
        const previousReads = reads;
        const previousWrites = writes;
        assert.deepEqual(await invoke(handler, user, body), {
          status: 403, response: { statusCode: 403, message: 'You are not authorized to access this customer', data: null },
        });
        assert.equal(reads, previousReads + 1);
        assert.equal(writes, previousWrites);
      }
      exists = false;
      assert.deepEqual(await invoke(handler, { id: 'other', role: 'USER' }, body), {
        status: 404, response: { statusCode: 404, message: 'Customer not found', data: null },
      });
      exists = true;
    }
    assert.equal((await invoke(getCustomerDetails, { id: 'other', role: 'USER' }, { userId: 'other' })).status, 403);
    assert.equal((await invoke(updateCustomer, { id: 'other', role: 'USER' }, { email: 'taken@example.com' })).status, 403);
    assert.equal(updateCustomerSchema.safeParse({ id, customerFirstName: 'Name', userId: 'other' }).success, false);
    assert.equal((await invoke(updateCustomer, { id: 'owner', role: 'USER' }, { customerFirstName: 'Name', userId: 'other' })).status, 400);
  } finally {
    [prisma.customer.findFirst, prisma.customer.update, prisma.$transaction, prisma.user.findFirst] = originals;
  }
});
