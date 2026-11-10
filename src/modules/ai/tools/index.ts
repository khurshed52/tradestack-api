
import type { FunctionDeclaration } from "@google/genai";

import { marketTools } from "./market.tools.js";
import { accountTools } from "./account.tools.js";
import { fundsTools } from "./funds.tools.js";
import { kycTools } from "./kyc.tools.js";
// Public tools: usable without private user context.
export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] =
  marketTools.filter(
    (tool) =>
      tool.name === "get_market_price" ||
      tool.name === "get_latest_market_news"
  );


 // Authenticated persistent chat:
 // Public market tools plus read-only customer tools.
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
