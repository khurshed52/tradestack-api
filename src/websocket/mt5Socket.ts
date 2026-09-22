import type { Server } from 'node:http';
import {
  WebSocket,
  WebSocketServer,
} from 'ws';


let mt5Wss: WebSocketServer | undefined;


// ======================================================
// LATEST MT5 STATE
// ======================================================

let latestAccount: any | null = null;

let latestSummary: any | null = null;

let latestPositions: any | null = null;


// ======================================================
// CREATE MT5 WEBSOCKET SERVER
// ======================================================

export function attachMt5Socket(
  _server: Server,
) {
  mt5Wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
  });


  // ====================================================
  // CLIENT CONNECTED
  // ====================================================

  mt5Wss.on(
    'connection',
    (socket) => {
      console.log(
        'MT5 WebSocket client connected',
      );


      // ------------------------------------------------
      // 1. CONNECTION
      // ------------------------------------------------

      socket.send(
        JSON.stringify({
          type: 'connected',
          source: 'mt5',
        }),
      );


      // ------------------------------------------------
      // 2. CURRENT ACCOUNT
      // ------------------------------------------------

      if (latestAccount !== null) {
        socket.send(
          JSON.stringify(
            latestAccount,
          ),
        );

        console.log(
          'Sent latest MT5 account to new client',
        );
      }


      // ------------------------------------------------
      // 3. CURRENT SUMMARY
      // ------------------------------------------------

      if (latestSummary !== null) {
        socket.send(
          JSON.stringify(
            latestSummary,
          ),
        );

        console.log(
          'Sent latest MT5 summary to new client',
        );
      }


      // ------------------------------------------------
      // 4. ALL CURRENT OPEN POSITIONS
      // ------------------------------------------------

      if (latestPositions !== null) {
        socket.send(
          JSON.stringify(
            latestPositions,
          ),
        );

        console.log(
          'Sent latest MT5 positions to new client',
        );
      }


      socket.on(
        'close',
        () => {
          console.log(
            'MT5 WebSocket client disconnected',
          );
        },
      );


      socket.on(
        'error',
        (error) => {
          console.error(
            'MT5 WebSocket client error:',
            error.message,
          );
        },
      );
    },
  );


  console.log(
    'MT5 WebSocket ready at /ws/mt5',
  );


  return mt5Wss;
}


// ======================================================
// HANDLE MT5 EVENT
// ======================================================

export function handleMt5Event(
  event: any,
) {

  // ====================================================
  // ACCOUNT
  // ====================================================

  if (event?.type === 'account') {
    const previous =
      latestAccount;


    latestAccount =
      event;


    // First account received.
    if (previous === null) {
      console.log(
        'Initial MT5 account received',
      );

      broadcastMt5Event(event);

      return;
    }


    const changed =
      previous.login !==
        event.login ||

      previous.balance !==
        event.balance ||

      previous.equity !==
        event.equity ||

      previous.currency !==
        event.currency;


    if (!changed) {
      return;
    }


    console.log(
      'MT5 account changed - broadcasting',
    );


    broadcastMt5Event(event);

    return;
  }


  // ====================================================
  // SUMMARY
  // ====================================================

  if (event?.type === 'summary') {
    const previous =
      latestSummary;


    latestSummary =
      event;


    // First summary received.
    if (previous === null) {
      console.log(
        'Initial MT5 summary received',
      );

      broadcastMt5Event(event);

      return;
    }


    const changed =
      previous.balance !==
        event.balance ||

      previous.totalLots !==
        event.totalLots ||

      previous.openPositions !==
        event.openPositions ||

      previous.profit !==
        event.profit ||

      previous.swaps !==
        event.swaps;


    if (!changed) {
      return;
    }


    console.log(
      'MT5 summary changed - broadcasting',
    );


    broadcastMt5Event(event);

    return;
  }


  // ====================================================
  // POSITIONS
  // ====================================================

  if (event?.type === 'positions') {
    const previous =
      latestPositions;


    // Always store the newest complete
    // open-position snapshot.
    latestPositions =
      event;


    // First position snapshot received.
    if (previous === null) {
      console.log(
        `Initial MT5 positions received: ${
          event.count ?? 0
        }`,
      );


      broadcastMt5Event(event);

      return;
    }


    // --------------------------------------------------
    // CHECK WHETHER POSITION SNAPSHOT CHANGED
    // --------------------------------------------------
    //
    // This compares the complete positions payload.
    //
    // It detects:
    // - new position
    // - closed position
    // - volume change
    // - current price change
    // - floating profit change
    // - swap change
    //
    // --------------------------------------------------

    const previousJson =
      JSON.stringify(previous);

    const currentJson =
      JSON.stringify(event);


    if (
      previousJson ===
      currentJson
    ) {
      // Recovery sync only.
      // Don't send duplicate data.
      return;
    }


    console.log(
      `MT5 positions changed - broadcasting ${
        event.count ?? 0
      } positions`,
    );


    broadcastMt5Event(event);

    return;
  }


  // ====================================================
  // DEAL / OTHER EVENTS
  // ====================================================

  broadcastMt5Event(event);
}


// ======================================================
// BROADCAST
// ======================================================

export function broadcastMt5Event(
  event: unknown,
) {
  if (!mt5Wss) {
    console.warn(
      'MT5 WebSocket has not been initialized',
    );

    return;
  }


  const message =
    JSON.stringify(event);


  for (
    const client of
    mt5Wss.clients
  ) {
    if (
      client.readyState !==
      WebSocket.OPEN
    ) {
      continue;
    }


    if (
      client.bufferedAmount >
      1024 * 1024
    ) {
      client.terminate();

      continue;
    }


    client.send(message);
  }
}