import { Router } from 'express';
import { createCheckout, getOrderStatus } from '../controller/PaymentController.js';

import { validateBody } from "../middleware/validate.js";
import { createCheckoutSchema, orderStatusSchema } from "../validation/paymentValidation.js";

const paymentRouter = Router();

paymentRouter.post('/createCheckout', validateBody(createCheckoutSchema), createCheckout);
paymentRouter.post('/getOrderStatus', validateBody(orderStatusSchema), getOrderStatus);

export default paymentRouter;
