import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { stripeWebhook } from '../src/modules/payment/stripeWebhook.controller.js';
import { stripe } from '../src/config/stripe.js';
import prisma from '../src/db/db.config.js';

test('signature checks, paid confirmation, duplicates, mismatch and late expiry', async () => {
 const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
 process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test_only';
 const originalFind = prisma.order.findUnique;
 const originalUpdate = prisma.order.updateMany;
 let status = 'PENDING'; let writes = 0;
 const id = '11111111-1111-4111-8111-111111111111';
 (prisma.order as any).findUnique = async () => ({ id, amount: 1000, currency: 'usd', stripeCheckoutId: 'cs_test_unit', status });
 (prisma.order as any).updateMany = async ({ where, data }: any) => {
  const matches = typeof where.status === 'string' ? status === where.status : status !== where.status.not;
  if (matches) { status = data.status; writes++; }
  return { count: matches ? 1 : 0 };
 };
 const call = async (type: string, overrides = {}, badSignature = false) => {
  const payload = JSON.stringify({ id: 'evt_test', type, livemode: false, data: { object: {
   id: 'cs_test_unit', metadata: {orderId:id}, client_reference_id:id,
   mode:'payment', amount_total:1000, currency:'usd', payment_status:'paid', payment_intent:'pi_test', ...overrides,
  } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  let code = 200;
  const res = { status(n: number) {code=n;return this;}, json() {return this;} };
  await stripeWebhook({ body:Buffer.from(payload), get:()=>badSignature?'bad':signature } as unknown as Request, res as unknown as Response);
  return code;
 };
 try {
  assert.equal(await call('checkout.session.completed', {}, true),400);
  assert.equal(await call('checkout.session.completed',{amount_total:99}),400);
  assert.equal(await call('checkout.session.completed',{payment_status:'unpaid'}),200);
  assert.equal(writes,0);
  assert.equal(await call('checkout.session.completed'),200);
  assert.equal(status,'PAID');
  await call('checkout.session.completed');
  await call('checkout.session.expired',{payment_status:'unpaid'});
  assert.equal(writes,1);
  assert.equal(status,'PAID');
 } finally {
  prisma.order.findUnique=originalFind;
  prisma.order.updateMany=originalUpdate;
  if(originalSecret===undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET=originalSecret;
 }
});
