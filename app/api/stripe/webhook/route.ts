import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getDb } from '@/lib/mongodb';
import { getConversation } from '@/lib/agent/conversationState';
import { registerLead } from '@/lib/agent/registerLead';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Stripe webhook signature error:', err.message);
    return Response.json({ error: err.message }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const telemovel = pi.metadata?.telemovel;

    if (telemovel) {
      try {
        const conv = await getConversation(telemovel);
        if (conv && conv.step === 'AWAITING_PAYMENT') {
          const db = await getDb();
          await registerLead(db, telemovel, conv);
        }
      } catch (err: any) {
        console.error('registerLead after payment error:', err.message);
        // Don't return 500 — Stripe would retry; log and ack
      }
    }
  }

  return Response.json({ received: true });
}
