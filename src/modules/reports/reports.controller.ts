
import type { Request, Response } from "express";
import { getDepositReport, getWithdrawalReport, getTransferReport } from "./reports.service.js";
import { parseReportRequest } from "./reports.validation.js";

export async function depositReportController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // --------------------------------------------------
    // AUTHENTICATED USER
    // --------------------------------------------------
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    // --------------------------------------------------
    // VALIDATE REQUEST BODY
    // --------------------------------------------------
    const input = parseReportRequest(req.body);

    // --------------------------------------------------
    // FETCH CUSTOMER DEPOSIT REPORT
    // --------------------------------------------------
    const result = await getDepositReport(input, userId);

   res.status(200).json({
        statusCode: 200,
        message: "Transactions retrieved successfully",
        ...result,
        });
  } catch (error) {
    // --------------------------------------------------
    // CUSTOMER NOT FOUND
    // --------------------------------------------------
    if (
      error instanceof Error &&
      error.message === "CUSTOMER_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Customer profile not found",
      });
      return;
    }

    // --------------------------------------------------
    // VALIDATION ERRORS
    // --------------------------------------------------
    if (
      error instanceof Error &&
      error.message.startsWith("INVALID_REPORT_")
    ) {
      res.status(400).json({
        message: error.message,
      });
      return;
    }

    // --------------------------------------------------
    // UNEXPECTED ERRORS
    // --------------------------------------------------
    console.error("Deposit report failed", error);

    res.status(500).json({
      message: "Unable to fetch deposit report",
    });
  }
}


export async function withdrawalReportController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // ----------------------------------------
    // AUTHENTICATED USER
    // ----------------------------------------
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
      });
      return;
    }

    // ----------------------------------------
    // VALIDATE WITHDRAWAL REPORT REQUEST
    // ----------------------------------------
    const input = parseReportRequest(
      req.body,
      "WITHDRAWAL"
    );

    // ----------------------------------------
    // FETCH CUSTOMER WITHDRAWAL REPORT
    // ----------------------------------------
    const result = await getWithdrawalReport(
      input,
      userId
    );

    // ----------------------------------------
    // SUCCESS RESPONSE
    // ----------------------------------------
    res.status(200).json({
      statusCode: 200,
      message: "Transactions retrieved successfully",
      ...result,
    });
  } catch (error) {
    // ----------------------------------------
    // CUSTOMER NOT FOUND
    // ----------------------------------------
    if (
      error instanceof Error &&
      error.message === "CUSTOMER_NOT_FOUND"
    ) {
      res.status(404).json({
        statusCode: 404,
        message: "Customer profile not found",
      });
      return;
    }

    // ----------------------------------------
    // INVALID REPORT INPUT
    // ----------------------------------------
    if (
      error instanceof Error &&
      error.message.startsWith("INVALID_REPORT_")
    ) {
      res.status(400).json({
        statusCode: 400,
        message: error.message,
      });
      return;
    }

    // ----------------------------------------
    // INTERNAL SERVER ERROR
    // ----------------------------------------
    console.error(
      "Withdrawal report failed",
      error
    );

    res.status(500).json({
      statusCode: 500,
      message: "Unable to fetch withdrawal report",
    });
  }
}


export async function transferReportController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // ----------------------------------------
    // AUTHENTICATED USER
    // ----------------------------------------
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
      });
      return;
    }

    // ----------------------------------------
    // VALIDATE TRANSFER REPORT REQUEST
    // ----------------------------------------
    const input = parseReportRequest(
      req.body,
      "TRANSFER"
    );

    // ----------------------------------------
    // FETCH CUSTOMER TRANSFER REPORT
    // ----------------------------------------
    const result = await getTransferReport(
      input,
      userId
    );

    // ----------------------------------------
    // SUCCESS RESPONSE
    // ----------------------------------------
    res.status(200).json({
      statusCode: 200,
      message: "Transactions retrieved successfully",
      ...result,
    });
  } catch (error) {
    // ----------------------------------------
    // CUSTOMER NOT FOUND
    // ----------------------------------------
    if (
      error instanceof Error &&
      error.message === "CUSTOMER_NOT_FOUND"
    ) {
      res.status(404).json({
        statusCode: 404,
        message: "Customer profile not found",
      });
      return;
    }

    // ----------------------------------------
    // INVALID REPORT INPUT
    // ----------------------------------------
    if (
      error instanceof Error &&
      error.message.startsWith("INVALID_REPORT_")
    ) {
      res.status(400).json({
        statusCode: 400,
        message: error.message,
      });
      return;
    }

    // ----------------------------------------
    // INTERNAL SERVER ERROR
    // ----------------------------------------
    console.error(
      "Transfer report failed",
      error
    );

    res.status(500).json({
      statusCode: 500,
      message: "Unable to fetch transfer report",
    });
  }
}
