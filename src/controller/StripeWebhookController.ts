import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import prisma from '../db/db.config.js';

export async function stripeWebhook(req: Request, res: Response) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ message: 'Webhook signing secret is not configured' });
    const signature = req.get('stripe-signature');
    if (!signature || !Buffer.isBuffer(req.body)) {
        return res.status(400).json({ message: 'Missing signature or raw request body' });
    }
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, secret);
    } catch {
        return res.status(400).json({ message: 'Invalid webhook signature' });
    }
    if (event.livemode) return res.status(400).json({ message: 'Only test events are accepted' });
    const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed', 'checkout.session.expired'];
    if (!supported.includes(event.type)) return res.json({ received: true });
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    // Ignore sessions that were not created by this application.
    if (!orderId) return res.json({ received: true });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
        return res.status(400).json({ message: 'Invalid order reference' });
    }
    try {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return res.status(500).json({ message: 'Order unavailable; retry later' });
        if (session.mode !== 'payment' || session.client_reference_id !== order.id ||
            session.amount_total !== order.amount || session.currency !== order.currency ||
            (order.stripeCheckoutId && order.stripeCheckoutId !== session.id)) {
            return res.status(400).json({ message: 'Checkout does not match order' });
        }
        const paid = session.payment_status === 'paid' &&
            ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type);
        const status = paid ? 'PAID' : event.type === 'checkout.session.expired' ? 'CANCELLED' :
            event.type === 'checkout.session.async_payment_failed' ? 'FAILED' : undefined;
        if (status) {
            // Atomic condition makes duplicate deliveries harmless and prevents
            // late failure/expiry events from overwriting a confirmed payment.
            await prisma.order.updateMany({
                where: {
                    id: order.id,
                    status: paid ? { not: 'PAID' } : 'PENDING',
                    OR: [{ stripeCheckoutId: session.id }, { stripeCheckoutId: null }],
                },
                data: {
                    status,
                    stripeCheckoutId: session.id,
                    ...(paid ? { stripePaymentIntentId: typeof session.payment_intent === 'string'
                        ? session.payment_intent : session.payment_intent?.id ?? null } : {}),
                },
            });
        }
        return res.json({ received: true });
    } catch {
        console.error('Stripe webhook database processing failed:', event.id);
        return res.status(500).json({ message: 'Webhook processing failed; retry later' });
    }
}
