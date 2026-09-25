import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { app } from '../src/app.js';
import prisma from '../src/db/db.config.js';
import { attachCryptoSocket } from '../src/modules/market/crypto.socket.js';

const server = createServer(app);
const wss = attachCryptoSocket(server);
const symbol = `TEST${Date.now()}`;
let client: WebSocket | undefined;
try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const save = await fetch(`${base}/api/crypto/saveCrypto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, buyPrice: '100', spread: '1', price: '99', changePercent: '-1', high: '110', low: '90' }),
    });
    assert.equal(save.status, 200);
    assert.equal(await prisma.cryptoPriceHistory.count({ where: { symbol } }), 1);
    client = new WebSocket(`ws://127.0.0.1:${address.port}/ws/crypto`);
    const receive = () => new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket timed out')), 10000);
        client!.once('message', raw => { clearTimeout(timeout); resolve(JSON.parse(raw.toString())); });
    });
    const initial = await receive();
    assert.equal(initial.type, 'crypto.snapshot');
    const record = initial.data.find((item: any) => item.symbol === symbol);
    assert.equal(record.price, '99');
    assert.equal(record.past30Min.length, 1);
    let extraMessages = 0;
    const countMessage = () => { extraMessages++; };
    client.on('message', countMessage);
    await new Promise(resolve => setTimeout(resolve, 6000));
    assert.equal(extraMessages, 0, 'No unchanged five-second snapshots');
    client.off('message', countMessage);
    const changedMessage = receive();
    await prisma.$executeRaw`UPDATE "Crypto" SET "price" = 101 WHERE "symbol" = ${symbol}`;
    const changed = await changedMessage;
    assert.equal(changed.data.find((item: any) => item.symbol === symbol).price, '101');
    const historyMessage = receive();
    await prisma.cryptoPriceHistory.create({ data: { symbol, price: '101' } });
    const historyChanged = await historyMessage;
    assert.equal(historyChanged.data.find((item: any) => item.symbol === symbol).past30Min.length, 2);
    console.log('PASS: initial snapshot, no idle polling, direct SQL update, history change notification');
} finally {
    client?.terminate();
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    server.close();
    await prisma.cryptoPriceHistory.deleteMany({ where: { symbol } });
    await prisma.crypto.deleteMany({ where: { symbol } });
    await prisma.$disconnect();
}
