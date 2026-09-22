import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createCheckout } from '../src/controller/PaymentController.js';

test('rejects invalid checkout inputs before creating an order', async () => {
    for (const body of [undefined, {amount:-10,currency:'usd'}, {amount:1.5,currency:'usd'},
        {amount:'1000',currency:'usd'}, {amount:1000001,currency:'usd'},
        {amount:1000,currency:'invalid'}, {amount:1000,currency:'usd',productName:' '}]) {
        let status = 200;
        const response = { status(code: number) {status=code;return this;}, json() {return this;} };
        await createCheckout({body: body ? { tradingAccountId: '974533', ...body } : body} as Request, response as unknown as Response);
        assert.equal(status,400);
    }
});

test('requires account and carries it through order, Stripe metadata, and response', async () => {
 const { default: prisma } = await import('../src/db/db.config.js');
 const { stripe } = await import('../src/config/stripe.js');
 const originalCreate = prisma.order.create;
 const originalUpdate = prisma.order.update;
 const originalSession = stripe.checkout.sessions.create;
 let stored: any; let stripeRequest: any; let output: any; let code = 200;
 (prisma.order as any).create = async ({data}: any) => {stored=data;return {id:'order-test',...data};};
 (prisma.order as any).update = async () => ({});
 (stripe.checkout.sessions as any).create = async (data: any) => {stripeRequest=data;return {id:'cs_test_mock',url:'https://example.test/checkout'};};
 const response = {status(n: number){code=n;return this;},json(data: any){output=data;return this;}};
 try {
  for (const account of [undefined, '', ' ', 974533, 'abc']) {
   await createCheckout({body:{amount:2000,currency:'usd',tradingAccountId:account}} as Request,response as unknown as Response);
   assert.equal(code,400);
   assert.equal(stored,undefined);
  }
  await createCheckout({body:{amount:2000,currency:'usd',tradingAccountId:'974533'}} as Request,response as unknown as Response);
  assert.equal(code,201);
  assert.equal(stored.tradingAccountId,'974533');
  assert.equal(stripeRequest.metadata.tradingAccountId,'974533');
  assert.equal(stripeRequest.payment_intent_data.metadata.tradingAccountId,'974533');
  assert.equal(output.data.tradingAccountId,'974533');
 } finally {
  prisma.order.create=originalCreate;prisma.order.update=originalUpdate;
  stripe.checkout.sessions.create=originalSession;
 }
});
