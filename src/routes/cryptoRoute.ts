import { Router } from 'express';
import { getAllCrypto, saveCryptoPrice } from '../controller/CryptoController.js';

import { validateBody } from "../middleware/validate.js";
import { saveCryptoSchema } from "../validation/cryptoValidation.js";

const cryptoRouter = Router();
cryptoRouter.post('/saveCrypto', validateBody(saveCryptoSchema), saveCryptoPrice);
cryptoRouter.post('/getAllCrypto', getAllCrypto);
export default cryptoRouter;
