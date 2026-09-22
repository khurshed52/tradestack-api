import type { Request, Response } from 'express';
import prisma from '../db/db.config.js';
import { stripe } from '../config/stripe.js';

export const createCheckout = async (req: Request, res: Response) => {
    const { amount, currency, tradingAccountId, productName = 'Test product' } = req.body ?? {};
    if (typeof tradingAccountId !== 'string' || !/^[0-9]{1,20}$/.test(tradingAccountId.trim())) {
        return res.status(400).json({ message: 'tradingAccountId is required and must be a string containing 1 to 20 digits' });
    }
    const accountId = tradingAccountId.trim();
    // This learning endpoint accepts minor units, e.g. 1000 = USD 10.00.
    // Limit currencies to two-decimal currencies to keep that contract explicit.
    const supportedCurrencies = ['usd', 'aed', 'eur', 'gbp'];
    const normalizedCurrency = typeof currency === 'string' ? currency.trim().toLowerCase() : '';
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
        return res.status(400).json({ message: 'amount must be an integer from 1 to 1000000 in minor currency units' });
    }
    if (!supportedCurrencies.includes(normalizedCurrency)) {
        return res.status(400).json({ message: 'Supported currencies: USD, AED, EUR, GBP' });
    }
    if (typeof productName !== 'string' || !productName.trim() || productName.trim().length > 120) {
        return res.status(400).json({ message: 'productName must contain 1 to 120 characters' });
    }
    const order = await prisma.order.create({
        data: {
            amount,
            tradingAccountId: accountId,
            currency: normalizedCurrency,
        },
    });

    const session = await stripe.checkout.sessions.create(
        {
            mode: 'payment',
            payment_method_types: ['card'],
            client_reference_id: order.id,
            metadata: { orderId: order.id, tradingAccountId: accountId },
            payment_intent_data: {
                metadata: { orderId: order.id, tradingAccountId: accountId },
            },
            line_items: [
                {
                    price_data: {
                        currency: order.currency,
                        unit_amount: order.amount,
                        product_data: { name: productName.trim() },
                    },
                    quantity: 1,
                },
            ],
            success_url: `${(process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${(process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '')}/payment/cancel`,
        },
        {
            idempotencyKey: `checkout:${order.id}`,
        }
    );

    await prisma.order.update({
        where: { id: order.id },
        data: { stripeCheckoutId: session.id },
    });

    return res.status(201).json({
        statusCode: 100,
        message: 'Checkout created',
        data: {
            orderId: order.id,
            tradingAccountId: accountId,
            checkoutUrl: session.url,
        },
    });
};

// Test integration: add authenticated order ownership checks before production.
export const getOrderStatus = async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const sessionId = req.body?.sessionId;
    if (typeof sessionId !== 'string' || !/^cs_test_[A-Za-z0-9]{1,200}$/.test(sessionId)) {
        return res.status(400).json({ message: 'A valid test Checkout sessionId is required' });
    }

    const order = await prisma.order.findUnique({
        where: { stripeCheckoutId: sessionId },
        select: {
            id: true, tradingAccountId: true, amount: true, currency: true,
            status: true, createdAt: true, updatedAt: true,
        },
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const messages = {
        PENDING: 'Confirming payment',
        PAID: 'Payment successful',
        FAILED: 'Payment failed',
        CANCELLED: 'Checkout expired or cancelled',
    };
    return res.json({
        statusCode: 100,
        message: messages[order.status],
        data: {
            orderId: order.id,
            tradingAccountId: order.tradingAccountId,
            amount: order.amount,
            amountDisplay: (order.amount / 100).toFixed(2),
            currency: order.currency,
            status: order.status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
        },
    });
};
