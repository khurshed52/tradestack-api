import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/app.js';

test('public routes bypass JWT authentication while protected groups require it', async () => {
    const realFetch = globalThis.fetch;
    // Keep IP geolocation deterministic and avoid contacting the provider.
    globalThis.fetch = async (input, init) => {
        if (String(input).startsWith('https://ipwho.is/')) {
            return Response.json({ success: true, ip: '203.0.113.1' });
        }
        return realFetch(input, init);
    };
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address();
        assert(address && typeof address !== 'string');
        const base = `http://127.0.0.1:${address.port}/api`;
        for (const headers of [{}, { Authorization: 'Bearer invalid' }]) {
            const response = await realFetch(`${base}/misc/ip-info`, { headers });
            assert.equal(response.status, 200);
            assert.equal((await response.json()).data.ip, '203.0.113.1');
        }
        const login = await realFetch(`${base}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        assert.equal(login.status, 400);
        const refresh = await realFetch(`${base}/auth/refresh`, { method: 'POST' });
        assert.equal(refresh.status, 401);
        assert.equal((await refresh.json()).message, 'Refresh token is required');
        for (const path of ['/auth/missing', '/misc/missing']) {
            assert.equal((await realFetch(`${base}${path}`)).status, 404);
        }
        for (const [method, path] of [
            ['POST', '/customer/getAllCustomer'], ['POST', '/crypto/getAllCrypto'],
            ['POST', '/payment/createCheckout'], ['GET', '/profile'], ['POST', '/mt5/events'],
        ]) {
            const response = await realFetch(`${base}${path}`, { method });
            assert.equal(response.status, 401, path);
            assert.equal((await response.json()).message, 'Authentication required', path);
        }
    } finally {
        globalThis.fetch = realFetch;
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
