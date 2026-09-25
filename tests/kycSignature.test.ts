import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { decodePngSignature, InvalidSignatureError, generateSignedKycAgreement } from '../src/modules/kyc/kycAgreement.service.js';
import { signKycAgreementSchema } from '../src/modules/kyc/kycSignature.validation.js';
import { signKycAgreement } from '../src/modules/kyc/kyc.controller.js';
import prisma from '../src/db/db.config.js';

const prefix = 'data:image/png;base64,';
const disguisedSvg = prefix + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');

test('genuine PNG decodes and produces a readable signed PDF with matching hash', async () => {
  const png = await fs.readFile('documents/kyc/test-signature.png');
  const signature = prefix + png.toString('base64');
  assert.deepEqual(decodePngSignature(signature), png);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert(signKycAgreementSchema.safeParse({ accepted: true, documentVersion: 'terms-v1', signature }).success);
  const result = await generateSignedKycAgreement({ customerId: `test-${crypto.randomUUID()}`, customerName: 'Test Customer', signatureBase64: signature, signedAt: new Date() });
  try {
    const bytes = await fs.readFile(result.documentPath);
    assert((await PDFDocument.load(bytes)).getPageCount() > 0);
    assert.equal(result.documentHash, crypto.createHash('sha256').update(bytes).digest('hex'));
  } finally { await fs.unlink(result.documentPath); }
});

test('decoder rejects disguised SVG, malformed base64, empty payload, and unsupported forms', () => {
  for (const value of [disguisedSvg, prefix + 'a===', prefix + 'abc', prefix + '!!!!', prefix, 'data:image/svg+xml;base64,PHN2Zz4=', 'PHN2Zz4=', prefix + 'AB==', prefix + 'iVBORw0KGgo=', null]) {
    assert.throws(() => decodePngSignature(value), InvalidSignatureError);
  }
  for (const signature of [prefix, prefix + 'abc', prefix + 'a===', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    assert.equal(signKycAgreementSchema.safeParse({ accepted: true, documentVersion: 'terms-v1', signature }).success, false);
  }
});

test('controller maps invalid PNG bytes to 400 without starting a database transaction', async () => {
  const originalFind = prisma.customer.findUnique;
  const originalTransaction = prisma.$transaction;
  (prisma.customer as any).findUnique = async () => ({ id: 'test', customerFirstName: 'Test', customerLastName: 'Customer', kycProfile: { status: 'IDENTITY_VERIFIED' }, kycAgreement: null });
  (prisma as any).$transaction = async () => { assert.fail('Invalid signature must not reach transaction'); };
  try {
    let status = 0;
    let body: unknown;
    await signKycAgreement({ user: { id: 'test' }, body: { accepted: true, documentVersion: 'terms-v1', signature: disguisedSvg } } as any,
      { status(code: number) { status = code; return this; }, json(data: unknown) { body = data; return this; } } as any);
    assert.equal(status, 400);
    assert.deepEqual(body, { statusCode: 400, message: 'Signature must be a valid PNG image', data: null });
  } finally {
    prisma.customer.findUnique = originalFind;
    prisma.$transaction = originalTransaction;
  }
});
