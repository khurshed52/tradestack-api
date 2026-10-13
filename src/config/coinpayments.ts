export const coinPaymentsConfig = {
  clientId: process.env.COINPAYMENTS_CLIENT_ID ?? "",
  clientSecret: process.env.COINPAYMENTS_CLIENT_SECRET ?? "",
  apiUrl: "https://a-api.coinpayments.net",
  enabled: process.env.COINPAYMENTS_ENABLED === "true",

  currencies: {
    TRC20: {
      id: "9:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      symbol: "USDT.TRC20",
    },
    ERC20: {
      id: "4:0xdac17f958d2ee523a2206206994597c13d831ec7",
      symbol: "USDT.ERC20",
    },
    LTCT: {
        id: "1002",
        symbol: "LTCT",
    },
    
  },
} as const;