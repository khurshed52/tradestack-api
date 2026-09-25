import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import { getCryptoSnapshot } from './crypto.service.js';
import { listenForCryptoChanges } from './cryptoNotifications.service.js';

export function attachCryptoSocket(_server: Server) {
  // Important:
  // server.ts will handle WebSocket upgrades.
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
  });

  const alive = new WeakSet<WebSocket>();
  const lastSent = new WeakMap<WebSocket, string>();

  let dirty = false;
  let running = false;
  let closed = false;
  let retry: NodeJS.Timeout | undefined;

  const send = (
    client: WebSocket,
    payload: string,
  ) => {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    if (client.bufferedAmount > 1024 * 1024) {
      client.terminate();
      return;
    }

    client.send(payload);
  };

  const errorPayload = JSON.stringify({
    type: 'crypto.error',
    message: 'Crypto updates temporarily unavailable',
  });

  const reportError = () => {
    for (const client of wss.clients) {
      send(client, errorPayload);
    }
  };

  const refresh = async () => {
    dirty = true;

    if (running || closed) {
      return;
    }

    running = true;

    try {
      while (dirty && !closed) {
        dirty = false;

        if (wss.clients.size === 0) {
          continue;
        }

        const payload = JSON.stringify({
          type: 'crypto.snapshot',
          statusCode: 100,
          message: 'Data fetched successfully',
          data: await getCryptoSnapshot(),
        });

        for (const client of wss.clients) {
          if (lastSent.get(client) !== payload) {
            send(client, payload);
            lastSent.set(client, payload);
          }
        }
      }
    } catch {
      reportError();

      if (!closed && !retry) {
        retry = setTimeout(() => {
          retry = undefined;
          void refresh();
        }, 2000);

        retry.unref();
      }
    } finally {
      running = false;
    }
  };

  const stopListening = listenForCryptoChanges(
    () => {
      void refresh();
    },
    reportError,
  );

  // ====================================================
  // CLIENT CONNECTED
  // ====================================================

  wss.on('connection', (client) => {
    console.log('Crypto WebSocket client connected');

    alive.add(client);

    client.on('pong', () => {
      alive.add(client);
    });

    client.on('error', () => {
      client.terminate();
    });

    void refresh();
  });

  // ====================================================
  // HEARTBEAT
  // ====================================================

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.has(client)) {
        client.terminate();
        continue;
      }

      alive.delete(client);
      client.ping();
    }
  }, 30000);

  heartbeat.unref();

  // ====================================================
  // WEBSOCKET SERVER CLOSE
  // ====================================================

  wss.on('close', () => {
    closed = true;

    stopListening();

    if (retry) {
      clearTimeout(retry);
    }

    clearInterval(heartbeat);
  });

  console.log(
    'Crypto WebSocket ready at /ws/crypto',
  );

  return wss;
}