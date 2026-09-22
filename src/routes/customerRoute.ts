import { Router } from "express";

import {
  createCustomer,
  getAllCustomer,
  getCustomerDetails,
  deleteCustomer,
  updateCustomer,
} from "../controller/CustomerController.js";

import { validateBody } from "../middleware/validate.js";
import { authorize } from "../middleware/authorize.js";

import {
  listCustomersSchema,
  customerDetailsSchema,
  updateCustomerSchema,
} from "../validation/customerValidation.js";

const customerRouter = Router();

// ==========================
// ADMIN ONLY
// ==========================

customerRouter.post(
  "/",
  authorize("ADMIN"),
  validateBody(listCustomersSchema),
  getAllCustomer
);

customerRouter.post(
  "/getAllCustomer",
  authorize("ADMIN"),
  validateBody(listCustomersSchema),
  getAllCustomer
);

customerRouter.post(
  "/createCustomer",
  authorize("ADMIN"),
  createCustomer
);

customerRouter.post(
  "/deleteCustomer",
  authorize("ADMIN"),
  validateBody(customerDetailsSchema),
  deleteCustomer
);

// ==========================
// USER / ADMIN
// Ownership check needed
// ==========================

customerRouter.post(
  "/getCustomerDetails",
  validateBody(customerDetailsSchema),
  getCustomerDetails
);

customerRouter.post(
  "/updateCustomer",
  validateBody(updateCustomerSchema),
  updateCustomer
);

export default customerRouter;