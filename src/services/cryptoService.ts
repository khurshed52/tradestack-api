import prisma from '../db/db.config.js';
import { Prisma } from '../generated/prisma/client.js';

export class CryptoInputError extends Error {}

export function parseCrypto(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new CryptoInputError('A JSON object is required');
    }
    const body = input as Record<string, unknown>;
    if (typeof body.symbol !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_-]{1,29}$/.test(body.symbol)) {
        throw new CryptoInputError('symbol must contain 2–30 letters, digits, /, _, or -');
    }
    const decimal = (key: string, signed = false) => {
        const value = body[key];
        const pattern = signed ? /^-?\d{1,10}(\.\d{1,8})?$/ : /^\d{1,18}(\.\d{1,10})?$/;
        if ((typeof value !== 'string' && typeof value !== 'number') || !pattern.test(String(value))) {
            throw new CryptoInputError(`${key} must be a ${signed ? '' : 'non-negative '}decimal value within supported precision`);
        }
        return new Prisma.Decimal(String(value));
    };
    const data = {
        symbol: body.symbol.toUpperCase(),
        buyPrice: body.buyPrice == null ? null : decimal('buyPrice'),
        spread: body.spread == null ? null : decimal('spread'),
        price: decimal('price'),
        changePercent: decimal('changePercent', true), high: decimal('high'), low: decimal('low'),
    };
    if (data.high.lessThan(data.low) || data.price.lessThan(data.low) || data.price.greaterThan(data.high)) {
        throw new CryptoInputError('price must be between low and high');
    }
    return data;
}

export async function saveCrypto(input: unknown) {
    const data = parseCrypto(input);
    return prisma.$transaction(async tx => {
        const crypto = await tx.crypto.upsert({ where: { symbol: data.symbol }, create: data, update: data });
        await tx.cryptoPriceHistory.create({ data: { symbol: data.symbol, price: data.price } });
        return crypto;
    });
}

export async function saveLiveCryptoPrice(symbol: string, price: string | number, timestamp: number) {
    if (typeof symbol !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_-]{1,29}$/.test(symbol)) {
        throw new CryptoInputError('Invalid live symbol');
    }
    if ((typeof price !== 'string' && typeof price !== 'number') ||
        !/^\d{1,18}(\.\d{1,10})?$/.test(String(price))) {
        throw new CryptoInputError('Invalid live price');
    }
    const value = new Prisma.Decimal(String(price));
    const recordedAt = new Date(timestamp * 1000);
    if (value.lte(0) || !Number.isFinite(timestamp) || timestamp <= 0 ||
        !Number.isFinite(recordedAt.getTime())) {
        throw new CryptoInputError('Invalid live price or timestamp');
    }
    return prisma.$transaction(async tx => {
        const crypto = await tx.crypto.update({
            where: { symbol },
            data: { price: value },
        });
        await tx.cryptoPriceHistory.create({ data: { symbol, price: value, recordedAt } });
        return crypto;
    });
}

export async function getCryptoSnapshot() {
    const rows = await prisma.crypto.findMany({
        orderBy: { symbol: 'asc' },
        include: { history: {
            where: { recordedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
            orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        } },
    });
    return rows.map(({ history, ...crypto }) => ({
        ...crypto,
        past30Min: history.map(point => ({ price: point.price, recordedAt: point.recordedAt })),
    }));
}
