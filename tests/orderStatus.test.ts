import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import prisma from '../src/db/db.config.js';
import { getOrderStatus } from '../src/modules/payment/payment.controller.js';

test('order lookup validates session, handles missing orders and reflects stored payment state', async () => {
 const original = prisma.order.findUnique;
 let row: any = null;
 let reads = 0;
 (prisma.order as any).findUnique = async ({where}: any) => {
  reads++; assert.equal(where.stripeCheckoutId,'cs_test_example'); return row;
 };
 const call = async (body: unknown) => {
  let code=200; let output: any; const headers: Record<string,string>={};
  const res={set(k:string,v:string){headers[k]=v;return this;},status(n:number){code=n;return this;},json(v:unknown){output=v;return this;}};
  await getOrderStatus({body} as Request,res as unknown as Response);
  assert.equal(headers['Cache-Control'],'no-store');
  return {code,output};
 };
 try {
  assert.equal((await call({sessionId:'bad'})).code,400);assert.equal(reads,0);
  assert.equal((await call({sessionId:'cs_test_example'})).code,404);
  for(const status of ['PENDING','PAID','FAILED','CANCELLED']) {
   row={id:'order',tradingAccountId:'974533',amount:2000,currency:'usd',status};
   const result=await call({sessionId:'cs_test_example',status:'PAID',amount:1});
   assert.equal(result.code,200);assert.equal(result.output.data.status,status);
   assert.equal(result.output.data.amountDisplay,'20.00');
   assert.equal(result.output.message==='Payment successful',status==='PAID');
  }
 } finally {prisma.order.findUnique=original;}
});
