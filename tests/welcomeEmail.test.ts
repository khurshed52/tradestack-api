import { test } from 'node:test';
import assert from 'node:assert/strict';
import sgMail from '@sendgrid/mail';
import prisma from '../src/db/db.config.js';
import { register } from '../src/modules/auth/auth.controller.js';

 test('welcome email follows commit, uses normalized email, and cannot fail registration', async () => {
  const originals = {
    user: prisma.user.findUnique, customer: prisma.customer.findUnique,
    transaction: prisma.$transaction, send: sgMail.send, error: console.error,
  };
  let committed = false;
  let failTransaction = false;
  let failEmail = false;
  let sent = 0;
  const logs: unknown[][] = [];
  const result = {
    user: { id: 'user-id', email: 'new@example.com', name: 'First Last' },
    customer: { id: 'customer-id', customerFirstName: 'First <name>' },
  };
  (prisma.user as any).findUnique = async () => null;
  (prisma.customer as any).findUnique = async () => null;
  (prisma as any).$transaction = async (callback: any) => {
    committed = false;
    if (failTransaction) throw new Error('Test transaction failure');
    const created = await callback({
      user: { create: async ({ data }: any) => {
        assert.equal(data.email, 'new@example.com');
        return result.user;
      } },
      customer: { create: async () => result.customer },
    });
    committed = true;
    return created;
  };
  sgMail.send = (async (message: any) => {
    assert(committed, 'Email must follow the completed transaction');
    sent++;
    assert.equal(message.to, result.user.email);
    assert.equal(message.subject, 'Welcome to TradePro');
    assert(message.html.includes('Dear First &lt;name&gt;,'));
    assert(message.html.includes('created successfully'));
    assert(message.html.includes('sign in'));
    assert(message.html.includes('All rights reserved'));
    assert(!message.html.includes('{{'));
    assert(!message.html.includes('private-password'));
    if (failEmail) throw new Error('Test email failure');
    return [];
  }) as any;
  console.error = (...args) => { logs.push(args); };
  const invoke = async () => {
    let status = 200;
    let body: any;
    const req = { body: {
      customerFirstName: 'First <name>', customerLastName: 'Last', email: ' NEW@example.com ',
      password: 'private-password', customerNationality: 'AE', phoneNumber: '123456789',
    } };
    const res = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
    await register(req as any, res as any);
    return { status, body };
  };
  try {
    for (const shouldFail of [false, true]) {
      failEmail = shouldFail;
      const response = await invoke();
      assert.equal(response.status, 201);
      assert.deepEqual(response.body, { statusCode: 201, message: 'User registered successfully', data: result });
    }
    assert.equal(sent, 2);
    assert(logs.some(([label]) => label === 'Welcome email failed:'));
    failTransaction = true;
    assert.equal((await invoke()).status, 500);
    assert.equal(sent, 2, 'Failed transaction must not send email');
  } finally {
    prisma.user.findUnique = originals.user;
    prisma.customer.findUnique = originals.customer;
    prisma.$transaction = originals.transaction;
    sgMail.send = originals.send;
    console.error = originals.error;
  }
});
