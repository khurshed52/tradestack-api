import 'dotenv/config';
import { Client } from 'pg';

// Dedicated connection: LISTEN subscriptions belong to a PostgreSQL session.
export function listenForCryptoChanges(onChange: () => void, onError: () => void) {
    let stopped = false;
    let current: Client | undefined;
    let retry: NodeJS.Timeout | undefined;
    const connect = async () => {
        if (stopped) return;
        const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
        current = client;
        let failed = false;
        const reconnect = () => {
            if (failed || stopped) return;
            failed = true;
            onError();
            void client.end().catch(() => {});
            retry = setTimeout(() => { void connect(); }, 2000);
            retry.unref();
        };
        client.on('error', reconnect);
        client.on('end', reconnect);
        client.on('notification', notification => {
            if (notification.channel === 'crypto_changed') onChange();
        });
        try {
            await client.connect();
            if (stopped) { await client.end(); return; }
            await client.query('LISTEN crypto_changed');
            // Resync on startup/reconnect because NOTIFY does not replay missed events.
            if (!stopped) onChange();
        } catch { reconnect(); }
    };
    void connect();
    return () => {
        stopped = true;
        if (retry) clearTimeout(retry);
        void current?.end().catch(() => {});
    };
}
