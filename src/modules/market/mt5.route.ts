import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { mt5EventSchema } from './mt5.validation.js';

import {
  handleMt5Event,
} from './mt5.socket.js';


const router = Router();


router.post('/events', validateBody(mt5EventSchema), (req, res) => {
  const event = req.body;


  console.log(
    '\n================ MT5 =================',
  );

  console.log(
    '📩 MT5 EVENT RECEIVED',
  );

  console.log(event);

  console.log(
    '======================================\n',
  );


  // Store important MT5 state
  // and broadcast the event to WebSocket clients.
  handleMt5Event(event);


  res.status(200).json({
    success: true,
  });
});


export default router;