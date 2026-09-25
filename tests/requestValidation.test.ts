import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { createAccessToken } from '../src/utils/jwt.js';
import { registerSchema, loginSchema, emailOnlySchema, verifyResetOtpSchema, resetPasswordSchema } from '../src/modules/auth/auth.validation.js';
import { listCustomersSchema, updateCustomerSchema } from '../src/modules/customer/customer.validation.js';
import { createCheckoutSchema, orderStatusSchema } from '../src/modules/payment/payment.validation.js';
import { saveCryptoSchema } from '../src/modules/market/crypto.validation.js';
import { mt5EventSchema } from '../src/modules/market/mt5.validation.js';
import { parseCrypto } from '../src/modules/market/crypto.service.js';

const id = '11111111-1111-4111-8111-111111111111';
const registration = {
  customerFirstName: ' First ', customerLastName: ' Last ', email: ' USER@example.com ',
  password: ' unchanged password ', customerNationality: ' AE ', phoneNumber: ' +9711234567 ',
};
const crypto = { symbol: 'btc/usd', price: '10.0000000001', low: '10', high: '11', changePercent: '-1.12345678' };

test('schemas preserve current optional fields, normalization and numeric contracts', () => {
  const result = registerSchema.parse(registration);
  assert.equal(result.email, 'USER@example.com'); // Controller still performs lowercasing.
  assert.equal(result.password, registration.password);
  assert.equal(result.customerFirstName, registration.customerFirstName);
  assert(registerSchema.safeParse({ ...registration, reglink: null }).success);
  assert(registerSchema.safeParse({ ...registration, reglink: '' }).success);
  for (const key of Object.keys(registration)) {
    assert.equal(registerSchema.safeParse({ ...registration, [key]: undefined }).success, false, key);
  }
  assert.equal(registerSchema.safeParse({ ...registration, email: {} }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'user@example.com', password: 'short' }).success, false);
  assert.equal(emailOnlySchema.safeParse({ email: 'not-email' }).success, false);
  for (const otp of ['123456', 123456, 'wrong', 123]) {
    assert.equal(verifyResetOtpSchema.parse({ email: 'user@example.com', otp }).otp, otp);
  }
  for (const otp of [{}, [], null, false]) {
    assert.equal(verifyResetOtpSchema.safeParse({ email: 'user@example.com', otp }).success, false);
  }
  assert.equal(resetPasswordSchema.parse({ resetToken: ' token ', newPassword: ' password ' }).resetToken, ' token ');
  assert.equal(resetPasswordSchema.parse({ resetToken: 'token', newPassword: ' password ' }).newPassword, ' password ');
  assert(updateCustomerSchema.safeParse({ id, phoneNumber: '123' }).success);
  for (const body of [{ id }, { id, phoneNumber: null }, { id, phoneNumber: '' }, { id, password: 'forbidden' }]) {
    assert.equal(updateCustomerSchema.safeParse(body).success, false);
  }
  assert.deepEqual(listCustomersSchema.parse(undefined), {});
  assert(listCustomersSchema.safeParse({ filters: { email: '@example', phoneNumber: '' } }).success);
  for (const body of [{ page: '1' }, { page: 0 }, { pageSize: 101 }, { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }, { filters: [] }, { filters: { unknown: 'x' } }]) {
    assert.equal(listCustomersSchema.safeParse(body).success, false);
  }
  assert(createCheckoutSchema.safeParse({ amount: 1, currency: ' USD ', tradingAccountId: ' 00123 ' }).success);
  for (const amount of ['100', 0, 1.5, 1000001]) {
    assert.equal(createCheckoutSchema.safeParse({ amount, currency: 'usd', tradingAccountId: '123' }).success, false);
  }
  assert(orderStatusSchema.safeParse({ sessionId: 'cs_test_abc123' }).success);
  assert.equal(orderStatusSchema.safeParse({ sessionId: 'cs_live_abc' }).success, false);
  for (const body of [crypto, { ...crypto, buyPrice: null, spread: null }, { ...crypto, price: 10 }]) {
    const parsed = saveCryptoSchema.parse(body);
    assert.deepEqual(parseCrypto(parsed), parseCrypto(body));
  }
  for (const body of [{ ...crypto, price: '12' }, { ...crypto, price: 'invalid' }, { ...crypto, price: '10.12345678901' }, { ...crypto, changePercent: '1.123456789' }]) {
    assert.equal(saveCryptoSchema.safeParse(body).success, false);
  }
  const event = { type: 'custom-provider-event', extra: { payload: [1, 2] } };
  assert.deepEqual(mt5EventSchema.parse(event), event);
  assert.equal(mt5EventSchema.safeParse([]).success, false);
});

test('routes reject malformed bodies with safe errors while preserving auth and cookie handling', async () => {
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'test-only-validation-secret';
  const token = await createAccessToken(id, 'USER');
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api`;
    const cases: [string, unknown, boolean][] = [
      ['/auth/register', {}, false], ['/auth/login', { email: {}, password: 'secret-invalid-value' }, false],
      ['/auth/forgot-password', { email: 'not-email' }, false], ['/auth/resend-reset-otp', { email: [] }, false],
      ['/auth/verify-reset-otp', { email: 'user@example.com', otp: { secret: 'secret-invalid-value' } }, false],
      ['/auth/reset-password', { resetToken: {}, newPassword: 'short' }, false],
      ['/customer', { page: 0 }, true], ['/customer/getAllCustomer', { filters: [] }, true],
      ['/customer/getCustomerDetails', { id: 'invalid' }, true], ['/customer/deleteCustomer', {}, true],
      ['/customer/updateCustomer', { id, password: 'secret-invalid-value' }, true],
      ['/payment/createCheckout', { amount: '100', currency: 'usd', tradingAccountId: '123' }, true],
      ['/payment/getOrderStatus', { sessionId: 'secret-invalid-value' }, true],
      ['/crypto/saveCrypto', { ...crypto, price: 'invalid' }, true],
    ];
    for (const [path, body, protectedRoute] of cases) {
      const response = await fetch(`${base}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(protectedRoute ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, path);
      const error = await response.json();
      assert.equal(error.statusCode, 400, path);
      assert.equal(error.message, 'Validation failed', path);
      assert(error.data.length > 0);
      assert(error.data.every((issue: any) => typeof issue.field === 'string' && typeof issue.message === 'string'));
      assert(!JSON.stringify(error).includes('secret-invalid-value'));
    }
    const missingBody = await fetch(`${base}/auth/register`, { method: 'POST' });
    assert.equal(missingBody.status, 400);
    assert.equal((await missingBody.json()).message, 'Validation failed');
    const unauthenticated = await fetch(`${base}/customer/updateCustomer`, { method: 'POST' });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).message, 'Authentication required');
    const refresh = await fetch(`${base}/auth/refresh`, { method: 'POST' });
    assert.equal(refresh.status, 401);
    assert.equal((await refresh.json()).message, 'Refresh token is required');
    const createCustomer = await fetch(`${base}/customer/createCustomer`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(createCustomer.status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = oldSecret;
  }
});
