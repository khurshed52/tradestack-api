
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { depositReportController , withdrawalReportController, transferReportController} from "./reports.controller.js";

const reportsRouter = Router();

// Customer Deposit Report
reportsRouter.post("/deposits", depositReportController);

// Customer Withdrawal Report
reportsRouter.post("/withdrawals", withdrawalReportController);

// Customer Transfer Report
reportsRouter.post("/transfers", transferReportController);

export default reportsRouter;
