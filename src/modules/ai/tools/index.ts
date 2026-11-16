
import type { FunctionDeclaration } from "@google/genai";

import { marketTools } from "./market.tools.js";
import { accountTools } from "./account.tools.js";
import { fundsTools } from "./funds.tools.js";
import { kycTools } from "./kyc.tools.js";
import { ragTools } from "./rag.tools.js";

// --------------------------------
// PUBLIC AI TOOL DECLARATIONS
// --------------------------------

// Public market tools and approved public knowledge.
export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  ...marketTools.filter(
    (tool) =>
      tool.name === "get_market_price" ||
      tool.name === "get_latest_market_news"
  ),

  ...ragTools.filter(
    (tool) =>
      tool.name === "search_platform_knowledge"
  ),
];

// --------------------------------
// AUTHENTICATED AI TOOL DECLARATIONS
// --------------------------------

// All public tools plus customer-specific tools.
export const AI_AUTHENTICATED_TOOL_DECLARATIONS:
  FunctionDeclaration[] = [
    ...AI_TOOL_DECLARATIONS,

    ...accountTools.filter(
      (tool) =>
        tool.name === "get_my_trading_accounts"
    ),

    ...fundsTools.filter(
      (tool) =>
        tool.name === "get_my_account_balances" ||
        tool.name === "get_my_fund_transactions"
    ),

    ...kycTools.filter(
      (tool) =>
        tool.name === "get_my_kyc_status"
    ),
  ];
