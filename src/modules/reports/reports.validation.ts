
export type ReportFilters = {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  reference?: string;
  tradingAccount?: string;

  // Deposit only
  paymentMethod?: string;

  // Withdrawal only
  withdrawalApprovalStatus?: string;
  payoutMethod?: string;

  // Transfer only
  sourceAccount?: string;
  destinationAccount?: string;
};

export type ReportRequest = {
  page: number;
  pageSize: number;
  filters: ReportFilters;
};

export type ReportResponse<T> = {
  page: number;
  pageSize: number;
  dataCount: number;
  pageCount: number;
  pageData: T[];
};

export type ReportType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER";

const allowedStatuses = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "CANCELLED",
] as const;

const allowedPaymentMethods = [
  "STRIPE",
  "MOCK",
  "COINPAYMENTS",
] as const;

const allowedApprovalStatuses = [
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

const commonFilterKeys = [
  "status",
  "dateFrom",
  "dateTo",
  "reference",
  "tradingAccount",
];

const depositFilterKeys = [
  ...commonFilterKeys,
  "paymentMethod",
];

const withdrawalFilterKeys = [
  ...commonFilterKeys,
  "withdrawalApprovalStatus",
  "payoutMethod",
];

const transferFilterKeys = [
  "status",
  "dateFrom",
  "dateTo",
  "reference",
  "sourceAccount",
  "destinationAccount",
];

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseDate(
  value: unknown,
  endOfDay: boolean
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error("INVALID_REPORT_DATE");
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("INVALID_REPORT_DATE");
  }

  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date.toISOString();
}

export function parseReportRequest(
  body: unknown,
  reportType: ReportType = "DEPOSIT"
): ReportRequest {
  // --------------------------------------------------
  // VALIDATE BODY
  // --------------------------------------------------
  if (!isRecord(body)) {
    throw new Error("INVALID_REPORT_BODY");
  }

  const allowedBodyKeys = [
    "page",
    "pageSize",
    "filters",
  ];

  if (
    Object.keys(body).some(
      (key) => !allowedBodyKeys.includes(key)
    )
  ) {
    throw new Error("INVALID_REPORT_BODY");
  }

  // --------------------------------------------------
  // PAGINATION
  // --------------------------------------------------
  const page = body.page ?? 1;
  const pageSize = body.pageSize ?? 10;
  const rawFilters = body.filters ?? {};

  if (
    typeof page !== "number" ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    typeof pageSize !== "number" ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger(
      (page - 1) * pageSize
    )
  ) {
    throw new Error(
      "INVALID_REPORT_PAGINATION"
    );
  }

  // --------------------------------------------------
  // REPORT-SPECIFIC FILTER KEYS
  // --------------------------------------------------
  const allowedFilterKeys =
    reportType === "TRANSFER"
      ? transferFilterKeys
      : reportType === "WITHDRAWAL"
        ? withdrawalFilterKeys
        : depositFilterKeys;

  if (
    !isRecord(rawFilters) ||
    Object.keys(rawFilters).some(
      (key) => !allowedFilterKeys.includes(key)
    )
  ) {
    throw new Error(
      "INVALID_REPORT_FILTERS"
    );
  }

  const filters: ReportFilters = {};

  // --------------------------------------------------
  // STATUS FILTER
  // --------------------------------------------------
  if (rawFilters.status !== undefined) {
    if (
      typeof rawFilters.status !== "string" ||
      !allowedStatuses.some(
        (status) =>
          status === rawFilters.status
      )
    ) {
      throw new Error(
        "INVALID_REPORT_STATUS"
      );
    }

    filters.status = rawFilters.status;
  }

  // --------------------------------------------------
  // REFERENCE FILTER
  // --------------------------------------------------
  if (rawFilters.reference !== undefined) {
    if (
      typeof rawFilters.reference !== "string" ||
      rawFilters.reference.length > 100
    ) {
      throw new Error(
        "INVALID_REPORT_REFERENCE"
      );
    }

    filters.reference =
      rawFilters.reference.trim();
  }

  // --------------------------------------------------
  // DATE FILTERS
  // --------------------------------------------------
  if (rawFilters.dateFrom !== undefined) {
    filters.dateFrom = parseDate(
      rawFilters.dateFrom,
      false
    );
  }

  if (rawFilters.dateTo !== undefined) {
    filters.dateTo = parseDate(
      rawFilters.dateTo,
      true
    );
  }

  if (
    filters.dateFrom &&
    filters.dateTo &&
    filters.dateFrom > filters.dateTo
  ) {
    throw new Error(
      "INVALID_REPORT_DATE_RANGE"
    );
  }

  // --------------------------------------------------
  // TRADING ACCOUNT FILTER
  // DEPOSIT AND WITHDRAWAL
  // --------------------------------------------------
  if (
    rawFilters.tradingAccount !== undefined
  ) {
    if (
      typeof rawFilters.tradingAccount !==
        "string" ||
      rawFilters.tradingAccount.trim()
        .length === 0 ||
      rawFilters.tradingAccount.length > 50
    ) {
      throw new Error(
        "INVALID_REPORT_TRADING_ACCOUNT"
      );
    }

    filters.tradingAccount =
      rawFilters.tradingAccount.trim();
  }

  // --------------------------------------------------
  // DEPOSIT: PAYMENT METHOD FILTER
  // --------------------------------------------------
  if (
    reportType === "DEPOSIT" &&
    rawFilters.paymentMethod !== undefined
  ) {
    if (
      typeof rawFilters.paymentMethod !==
        "string" ||
      !allowedPaymentMethods.some(
        (method) =>
          method === rawFilters.paymentMethod
      )
    ) {
      throw new Error(
        "INVALID_REPORT_PAYMENT_METHOD"
      );
    }

    filters.paymentMethod =
      rawFilters.paymentMethod;
  }

  // --------------------------------------------------
  // WITHDRAWAL: APPROVAL STATUS FILTER
  // --------------------------------------------------
  if (
    reportType === "WITHDRAWAL" &&
    rawFilters.withdrawalApprovalStatus !==
      undefined
  ) {
    if (
      typeof rawFilters.withdrawalApprovalStatus !==
        "string" ||
      !allowedApprovalStatuses.some(
        (status) =>
          status ===
          rawFilters.withdrawalApprovalStatus
      )
    ) {
      throw new Error(
        "INVALID_REPORT_APPROVAL_STATUS"
      );
    }

    filters.withdrawalApprovalStatus =
      rawFilters.withdrawalApprovalStatus;
  }

  // --------------------------------------------------
  // WITHDRAWAL: PAYOUT METHOD FILTER
  // --------------------------------------------------
  if (
    reportType === "WITHDRAWAL" &&
    rawFilters.payoutMethod !== undefined
  ) {
    if (
      typeof rawFilters.payoutMethod !==
        "string" ||
      !allowedPaymentMethods.some(
        (method) =>
          method === rawFilters.payoutMethod
      )
    ) {
      throw new Error(
        "INVALID_REPORT_PAYOUT_METHOD"
      );
    }

    filters.payoutMethod =
      rawFilters.payoutMethod;
  }

  // --------------------------------------------------
  // TRANSFER: SOURCE ACCOUNT FILTER
  // --------------------------------------------------
  if (
    reportType === "TRANSFER" &&
    rawFilters.sourceAccount !== undefined
  ) {
    if (
      typeof rawFilters.sourceAccount !==
        "string" ||
      rawFilters.sourceAccount.trim()
        .length === 0 ||
      rawFilters.sourceAccount.length > 50
    ) {
      throw new Error(
        "INVALID_REPORT_SOURCE_ACCOUNT"
      );
    }

    filters.sourceAccount =
      rawFilters.sourceAccount.trim();
  }

  // --------------------------------------------------
  // TRANSFER: DESTINATION ACCOUNT FILTER
  // --------------------------------------------------
  if (
    reportType === "TRANSFER" &&
    rawFilters.destinationAccount !== undefined
  ) {
    if (
      typeof rawFilters.destinationAccount !==
        "string" ||
      rawFilters.destinationAccount.trim()
        .length === 0 ||
      rawFilters.destinationAccount.length > 50
    ) {
      throw new Error(
        "INVALID_REPORT_DESTINATION_ACCOUNT"
      );
    }

    filters.destinationAccount =
      rawFilters.destinationAccount.trim();
  }

  return {
    page,
    pageSize,
    filters,
  };
}
