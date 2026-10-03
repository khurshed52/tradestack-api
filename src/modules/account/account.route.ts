import { Router } from "express";

import { createTradingAccount, getTradingAccounts, getAllAccounts } from "./tradingAccount.controller.js";
import { validateBody } from "../../middleware/validate.js";
import { createTradingAccountSchema } from "./tradingAccount.validation.js";

const accountRouter = Router();

/*
 * Create an additional trading account.
 *
 * Account #1 is automatically created after KYC approval.
 * Customer can create Account #2 and Account #3.
 * Maximum accounts per customer: 3.
 */
accountRouter.post(
  "/createAccounts",
  validateBody(createTradingAccountSchema),
  createTradingAccount,
);

accountRouter.post(
  "/getAccounts",
  getTradingAccounts,
); 
accountRouter.get("/all", getAllAccounts);


export default accountRouter;