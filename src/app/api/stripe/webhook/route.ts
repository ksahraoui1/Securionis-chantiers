import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { getStripeWebhookSecret } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 * Gère les événements Stripe (subscription créée, mise à jour, annulée, etc.)
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

        // Extraire les dates de période depuis l'objet subscription
        const periodStart = "current_period_start" in subscription
          ? new Date((subscription as Record<string, unknown>).current_period_start as number * 1000).toISOString()
          : null;
        const periodEnd = "current_period_end" in subscription
          ? new Date((subscription as Record<string, unknown>).current_period_end as number * 1000).toISOString()
          : null;
        const trialEnd = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null;
        const cancelAt = subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000).toISOString()
          : null;

        const interval = subscription.items.data[0]?.price?.recurring?.interval;

        await serviceClient
          .from("subscriptions")
          .update({
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            plan: interval === "year" ? "yearly" : "monthly",
            current_period_start: periodStart,
            current_period_end: periodEnd,
            trial_end: trialEnd,
            cancel_at: cancelAt,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        // Mettre à jour le rôle si abonnement actif ou en essai
        if (subscription.status === "active" || subscription.status === "trialing") {
          const { data: sub } = await serviceClient
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (sub) {
            await serviceClient
              .from("profiles")
              .update({ role: "inspecteur", updated_at: new Date().toISOString() })
              .eq("id", sub.user_id)
              .eq("role", "invité");
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

        // Rétrograder vers invité
        const { data: sub } = await serviceClient
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (sub) {
          await serviceClient
            .from("profiles")
            .update({ role: "invité", updated_at: new Date().toISOString() })
            .eq("id", sub.user_id)
            .in("role", ["inspecteur"]);

          await serviceClient
            .from("subscriptions")
            .update({
              status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await serviceClient
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
