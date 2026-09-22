import 'dotenv/config';
import { saveCrypto } from './cryptoService.js';
import { Prisma } from '../generated/prisma/client.js';
export async function fetchTwelveDataQuote(symbol: string) {
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
        throw new Error('TWELVE_DATA_API_KEY is missing');
    }

    const url = new URL('https://api.twelvedata.com/quote');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        throw new Error(`Twelve Data request failed: ${response.status}`);
    }

    const quote = await response.json();

    // The provider may return an API error inside an HTTP 200 response.
    if (quote.status === 'error') {
        throw new Error(quote.message || 'Twelve Data returned an error');
    }

    return quote;
}

export async function importTwelveDataQuote(symbol: string) {
    const quote = await fetchTwelveDataQuote(symbol);
    return saveCrypto({
        symbol: quote.symbol,
        price: quote.close,
        changePercent: new Prisma.Decimal(quote.percent_change).toDecimalPlaces(8).toFixed(),
        high: quote.high,
        low: quote.low,
        buyPrice: null,
        spread: null,
    });
}
