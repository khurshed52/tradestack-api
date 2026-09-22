import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import argon2 from 'argon2';
import { app } from '../src/app.js';
import prisma from '../src/db/db.config.js';
import { hashRefreshToken } from '../src/utils/refreshToken.js';
import { verifyAccessToken } from '../src/utils/jwt.js';

test('login cookie is parsed on refresh and returns a valid access token', async () => {
    const oldSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'test-only-refresh-secret-not-for-production';
    const user = { id: '11111111-1111-4111-8111-111111111111', name: 'Test',
        email: 'test@example.invalid', role: 'CUSTOMER', isActive: true,
        passwordHash: await argon2.hash('test-password') };
    const originals = [prisma.user.findUnique, prisma.userSession.create,
        prisma.userSession.findUnique, prisma.userSession.update] as const;
    let session: any;
    let updates = 0;
    (prisma.user as any).findUnique = async () => user;
    (prisma.userSession as any).create = async ({ data }: any) => {
        session = { id: 'test-session', ...data, revokedAt: null, user }; return session;
    };
    (prisma.userSession as any).findUnique = async ({ where }: any) =>
        where.refreshTokenHash === session.refreshTokenHash ? session : null;
    (prisma.userSession as any).update = async () => { updates++; return session; };
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address();
        assert(address && typeof address !== 'string');
        const base = `http://127.0.0.1:${address.port}/api/auth`;
        const login = await fetch(`${base}/login`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: 'test-password' }) });
        assert.equal(login.status, 200);
        const setCookie = login.headers.get('set-cookie');
        assert(setCookie?.includes('HttpOnly'));
        const cookie = setCookie.split(';')[0];
        assert.equal(hashRefreshToken(cookie.slice('refreshToken='.length)), session.refreshTokenHash);
        const refresh = await fetch(`${base}/refresh`, { method: 'POST', headers: { Cookie: cookie } });
        assert.equal(refresh.status, 200);
        const result = await refresh.json();
        assert.equal((await verifyAccessToken(result.data.accessToken)).sub, user.id);
        assert.equal(updates, 1);
        const missing = await fetch(`${base}/refresh`, { method: 'POST' });
        assert.equal(missing.status, 401);
        assert.equal((await missing.json()).message, 'Refresh token is required');
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        [prisma.user.findUnique, prisma.userSession.create,
            prisma.userSession.findUnique, prisma.userSession.update] = originals;
        if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
        else process.env.JWT_ACCESS_SECRET = oldSecret;
    }
});
