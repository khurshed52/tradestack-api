import { Router } from 'express';
import { createCheckout, getOrderStatus } from './payment.controller.js';

import { validateBody } from "../../middleware/validate.js";
import { createCheckoutSchema, orderStatusSchema } from "./payment.validation.js";

const paymentRouter = Router();

paymentRouter.post('/createCheckout', validateBody(createCheckoutSchema), createCheckout);
paymentRouter.post('/getOrderStatus', validateBody(orderStatusSchema), getOrderStatus);

export default paymentRouter;
