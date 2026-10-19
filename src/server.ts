
import 'dotenv/config';

import { createServer } from 'node:http';

import { app } from './app.js';
import { connectRedis, disconnectRedis } from './config/redis.js';

import {
  attachCryptoSocket,
} from './modules/market/crypto.socket.js';

import {
  attachMt5Socket,
} from './modules/market/mt5.socket.js';

import {
  startTwelveDataStream,
} from './modules/market/twelveDataStream.service.js';


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
// BULLMQ EMAIL BACKGROUND PROCESSING
// ======================================================
//
// Optional, controlled by ENABLE_EMAIL_WORKER.
//
// Uses existing queue, worker and dispatcher.
// Does not import email.runner.ts because that file
// already manages its own startup/shutdown signals.
//
// ======================================================

const EMAIL_DISPATCH_INTERVAL_MS = 10_000;

let stopEmailProcessing:
  (() => Promise<void>) | undefined;

let emailStartup:
  Promise<void> | undefined;

const startEmailProcessing = (): void => {
  if (
    process.env.ENABLE_EMAIL_WORKER !== 'true'
  ) {
    console.log('BullMQ email worker disabled');
    return;
  }

  if (emailStartup) {
    return;
  }

  emailStartup = (async () => {
    const [
      { emailWorker },
      { dispatchPendingEmailEvents },
      { emailQueue },
    ] = await Promise.all([
      import('./jobs/workers/email.worker.js'),
      import('./jobs/services/emailOutbox.dispatcher.js'),
      import('./jobs/queues/email.queue.js'),
    ]);

    let dispatching = false;
    let dispatchPromise: Promise<void> | undefined;
    let stopping = false;

    const dispatch = (): void => {
      if (dispatching || stopping) {
        return;
      }

      dispatching = true;

      dispatchPromise = (async () => {
        try {
          await dispatchPendingEmailEvents();
        } catch (error) {
          console.error(
            '[Email Runner] Dispatch failed:',
            error,
          );
        } finally {
          dispatching = false;
        }
      })();
    };

    // Worker uses autorun: false, so start explicitly.
    const workerRun = emailWorker.run();

    void workerRun.catch((error) => {
      console.error(
        '[Email Runner] Worker failed:',
        error,
      );
    });

    // Dispatch immediately and every 10 seconds.
    dispatch();

    const timer = setInterval(
      dispatch,
      EMAIL_DISPATCH_INTERVAL_MS,
    );

    let stopPromise: Promise<void> | undefined;

    stopEmailProcessing = () => {
      if (stopPromise) {
        return stopPromise;
      }

      stopping = true;
      clearInterval(timer);

      stopPromise = (async () => {
        try {
          await dispatchPromise;
        } finally {
          try {
            await emailWorker.close();
          } finally {
            await emailQueue.close();
          }
        }

        await workerRun;

        console.log(
          '[Email Runner] Stopped',
        );
      })();

      return stopPromise;
    };

    console.log(
      '[Email Runner] Started inside Express',
    );

    if (shuttingDown) {
      await stopEmailProcessing();
    }
  })().catch((error) => {
    console.error(
      '[Email Runner] Startup failed:',
      error,
    );
  });
};


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

    // Stop BullMQ before disconnecting other services.
    try {
      await emailStartup;
      await stopEmailProcessing?.();
    } catch (error) {
      console.error(
        'BullMQ shutdown failed:',
        error,
      );
    }

    // Gracefully disconnect Redis
    try {
      await disconnectRedis();
      console.log('Redis disconnected');
    } catch (error) {
      console.error('Redis shutdown failed:', error);
    }

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

    // Redis is optional: connection failure must not
    // prevent existing APIs from starting.
    void connectRedis();

    // Optional BullMQ background email processing.
    startEmailProcessing();

    console.log(
      `Crypto WebSocket: ws://localhost:${port}/ws/crypto`,
    );

    console.log(
      `MT5 WebSocket: ws://localhost:${port}/ws/mt5`,
    );


    if (process.env.ENABLE_MARKET_PRICE_UPDATES !== 'true') {
      console.log('Automatic market price updates disabled');
      return;
    }

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
