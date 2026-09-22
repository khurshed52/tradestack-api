import 'dotenv/config';
import WebSocket from 'ws';
import { importTwelveDataQuote } from './twelveDataService.js';
import { saveLiveCryptoPrice } from './cryptoService.js';
import prisma from '../db/db.config.js';

// Basic-plan forex streaming is restricted to trial symbols.
// Add other forex pairs here after confirming WebSocket access for the account.
export const TWELVE_DATA_SYMBOLS = ['BTC/USD', 'ETH/USD', 'BNB/USD', 'EUR/USD'];

export async function startTwelveDataStream() {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is missing');

    let stopped = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let retryDelay = 1000;
    let saveQueue = Promise.resolve();
    const initialized = new Set<string>();
    const initializing = new Set<string>();
    const retryAfter = new Map<string, number>();
    const initialize = async (symbol: string) => {
        if (stopped || initialized.has(symbol) || initializing.has(symbol) ||
            Date.now() < (retryAfter.get(symbol) ?? 0)) return;
        initializing.add(symbol);
        try {
            const existing = await prisma.crypto.findUnique({ where: { symbol }, select: { symbol: true } });
            if (!existing) await importTwelveDataQuote(symbol);
            initialized.add(symbol);
            retryAfter.delete(symbol);
            console.log('Ready for live prices:', symbol);
        } catch {
            retryAfter.set(symbol, Date.now() + 65000);
            console.error(`Unable to initialize ${symbol}; retrying after 65 seconds on the next price event`);
        } finally { initializing.delete(symbol); }
    };
    const lastSaved = new Map<string, { timestamp: number; price: string }>();

    const connect = async () => {
        if (stopped) return;
        // Failed symbols retry on reconnect; successful ones are not re-seeded.
        for (const symbol of TWELVE_DATA_SYMBOLS) {
            if (stopped) return;
            await initialize(symbol);
        }
        if (stopped) return;
        const current = new WebSocket(
            `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`,
            { handshakeTimeout: 15000 },
        );
        socket = current;
        let lastResponse = Date.now();
        current.on('open', () => {
            console.log('Connected to Twelve Data');
            current.send(JSON.stringify({ action: 'subscribe', params: { symbols: TWELVE_DATA_SYMBOLS.join(',') } }));
            heartbeat = setInterval(() => {
                if (Date.now() - lastResponse > 60000) {
                    current.terminate();
                    return;
                }
                if (current.readyState === WebSocket.OPEN) {
                    current.send(JSON.stringify({ action: 'heartbeat' }));
                    current.ping();
                }
            }, 10000);
            heartbeat.unref();
        });
        current.on('pong', () => { lastResponse = Date.now(); retryDelay = 1000; });
        current.on('message', raw => {
            lastResponse = Date.now();
            try {
                const event = JSON.parse(raw.toString());
                if (event.event === 'price') {
                    if (!TWELVE_DATA_SYMBOLS.includes(event.symbol)) return;
                    if (!initialized.has(event.symbol)) {
                        void initialize(event.symbol);
                        return;
                    }
                    saveQueue = saveQueue.then(async () => {
                        const previous = lastSaved.get(event.symbol);
                        if (previous && (event.timestamp < previous.timestamp ||
                            (event.timestamp === previous.timestamp && String(event.price) === previous.price))) return;
                        await saveLiveCryptoPrice(event.symbol, event.price, event.timestamp);
                        lastSaved.set(event.symbol, { timestamp: event.timestamp, price: String(event.price) });
                        console.log('Price saved:', event.symbol, event.price);
                    }).catch(() => { console.error('Failed to save Twelve Data live price'); });
                } else if (event.event !== 'heartbeat') {
                    console.log('Twelve Data subscription:', event);
                }
            } catch { console.error('Invalid Twelve Data message'); }
        });
        current.on('error', () => {
            console.error('Twelve Data connection error; reconnecting');
            current.terminate();
        });
        current.on('close', () => {
            if (heartbeat) clearInterval(heartbeat);
            if (stopped) return;
            const delay = retryDelay;
            retryDelay = Math.min(retryDelay * 2, 30000);
            console.log(`Twelve Data disconnected; reconnecting in ${delay / 1000}s`);
            reconnectTimer = setTimeout(() => { void connect(); }, delay);
            reconnectTimer.unref();
        });
    };
    // Return cleanup immediately, including while initial REST requests are pending.
    void connect();
    return async () => {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (heartbeat) clearInterval(heartbeat);
        socket?.terminate();
        await saveQueue;
    };
}
