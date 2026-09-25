import { Router } from 'express';
import { getAllCrypto, saveCryptoPrice } from './crypto.controller.js';

import { validateBody } from "../../middleware/validate.js";
import { saveCryptoSchema } from "./crypto.validation.js";

const cryptoRouter = Router();
cryptoRouter.post('/saveCrypto', validateBody(saveCryptoSchema), saveCryptoPrice);
cryptoRouter.post('/getAllCrypto', getAllCrypto);
export default cryptoRouter;
