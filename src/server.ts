import 'dotenv/config';

import { createServer } from 'node:http';

import { app } from './app.js';

import {
  attachCryptoSocket,
} from './websocket/cryptoSocket.js';

import {
  attachMt5Socket,
} from './websocket/mt5Socket.js';

import {
  startTwelveDataStream,
} from './services/twelveDataStream.js';


const port = Number(
  process.env.PORT ?? 3001,
);


// ======================================================
// CREATE HTTP SERVER
// ======================================================

const server = createServer(app);


// ======================================================
// CREATE WEBSOCKET SERVERS
// ======================================================

const cryptoWss =
  attachCryptoSocket(server);

const mt5Wss =
  attachMt5Socket(server);


// ======================================================
// ONE WEBSOCKET UPGRADE ROUTER
// ======================================================
//
// This is the ONLY place that decides which
// WebSocket server receives the connection.
//
// /ws/crypto → cryptoSocket
// /ws/mt5    → mt5Socket
//
// ======================================================

server.on(
  'upgrade',
  (request, socket, head) => {
    const url = new URL(
      request.url ?? '/',
      'http://localhost',
    );


    // --------------------------------------------------
    // CRYPTO WEBSOCKET
    // --------------------------------------------------

    if (url.pathname === '/ws/crypto') {
      cryptoWss.handleUpgrade(
        request,
        socket,
        head,
        (webSocket) => {
          cryptoWss.emit(
            'connection',
            webSocket,
            request,
          );
        },
      );

      return;
    }


    // --------------------------------------------------
    // MT5 WEBSOCKET
    // --------------------------------------------------

    if (url.pathname === '/ws/mt5') {
      mt5Wss.handleUpgrade(
        request,
        socket,
        head,
        (webSocket) => {
          mt5Wss.emit(
            'connection',
            webSocket,
            request,
          );
        },
      );

      return;
    }


    // --------------------------------------------------
    // UNKNOWN WEBSOCKET PATH
    // --------------------------------------------------

    console.warn(
      `Rejected unknown WebSocket path: ${url.pathname}`,
    );

    socket.destroy();
  },
);


// ======================================================
// SERVER ERROR
// ======================================================

server.on('error', (error) => {
  console.error(
    `Failed to start server on port ${port}:`,
    error.message,
  );

  process.exit(1);
});


// ======================================================
// TWELVE DATA
// ======================================================

let stopTwelveData:
  (() => Promise<void>) | undefined;

let shuttingDown = false;


// ======================================================
// SHUTDOWN
// ======================================================

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  void (async () => {
    console.log('Shutting down server...');

    await stopTwelveData?.();


    // Close WebSocket clients
    for (const client of cryptoWss.clients) {
      client.terminate();
    }

    for (const client of mt5Wss.clients) {
      client.terminate();
    }


    cryptoWss.close();
    mt5Wss.close();


    server.close(() => {
      process.exit(0);
    });
  })();
};


process.once(
  'SIGINT',
  shutdown,
);

process.once(
  'SIGTERM',
  shutdown,
);

process.once(
  'SIGUSR2',
  shutdown,
);


// ======================================================
// START SERVER
// ======================================================

server.listen(
  port,
  () => {
    console.log(
      `Server listening on http://localhost:${port}`,
    );

    console.log(
      `Crypto WebSocket: ws://localhost:${port}/ws/crypto`,
    );

    console.log(
      `MT5 WebSocket: ws://localhost:${port}/ws/mt5`,
    );


    void startTwelveDataStream()
      .then((stop) => {
        stopTwelveData = stop;

        if (shuttingDown) {
          void stop();
        }
      })
      .catch(() => {
        console.error(
          'Unable to start Twelve Data stream',
        );
      });
  },
);