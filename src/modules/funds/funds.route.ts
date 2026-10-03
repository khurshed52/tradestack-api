import { Router } from "express";

import { validateBody } from "../../middleware/validate.js";

import { authenticate } from "../../middleware/authenticate.js";

import { authorize } from "../../middleware/authorize.js";

import {
  createDepositSchema,
  depositStatusSchema,
  exchangeRateSchema,
  withdrawSchema,
  withdrawalAdminDecisionSchema,
  processWithdrawalSchema,
  transferSchema,
  transactionHistorySchema
} from "./funds.validation.js";

import {
  createDepositController,
  getDepositStatusController,
  getExchangeRateController,
  createWithdrawalController,
  approveWithdrawalController,
  rejectWithdrawalController,
  processWithdrawalController,
  createTransferController,
  getTransactionHistoryController
} from "./funds.controller.js";

const fundsRouter = Router();

// ======================================================
// CUSTOMER FUND ROUTES
// ======================================================

fundsRouter.post(
  "/deposit",
  validateBody(createDepositSchema),
  createDepositController,
);

fundsRouter.post(
  "/deposit/status",
  validateBody(depositStatusSchema),
  getDepositStatusController,
);

fundsRouter.post(
  "/exchange-rate",
  validateBody(exchangeRateSchema),
  getExchangeRateController,
);

fundsRouter.post(
  "/withdraw",
  validateBody(withdrawSchema),
  createWithdrawalController,
);

// ======================================================
// ADMIN WITHDRAWAL ROUTES
// ======================================================

fundsRouter.post(
  "/admin/withdrawals/:transactionId/approve",
  authenticate,
  authorize("ADMIN"),
  validateBody(withdrawalAdminDecisionSchema),
  approveWithdrawalController,
);

fundsRouter.post(
  "/admin/withdrawals/:transactionId/reject",
  authenticate,
  authorize("ADMIN"),
  validateBody(withdrawalAdminDecisionSchema),
  rejectWithdrawalController,
);


// ======================================================
// ADMIN WITHDRAWAL ROUTES
// ======================================================

fundsRouter.post(
  "/admin/withdrawals/:transactionId/approve",
  authenticate,
  authorize("ADMIN"),
  validateBody(
    withdrawalAdminDecisionSchema
  ),
  approveWithdrawalController
);

fundsRouter.post(
  "/admin/withdrawals/:transactionId/reject",
  authenticate,
  authorize("ADMIN"),
  validateBody(
    withdrawalAdminDecisionSchema
  ),
  rejectWithdrawalController
);

fundsRouter.post(
  "/admin/withdrawals/:transactionId/process",
  authenticate,
  authorize("ADMIN"),
  validateBody(
    processWithdrawalSchema
  ),
  processWithdrawalController
);

fundsRouter.post(
  "/transfer",
  validateBody(transferSchema),
  createTransferController
);

fundsRouter.post(
  "/transactions",
  validateBody(transactionHistorySchema),
  getTransactionHistoryController
);

export default fundsRouter;
