import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/env";

/**
 * POST /api/stripe/checkout
 * Body: { plan: "monthly" | "yearly" }
 * Crée une session Stripe Checkout avec 14 jours d'essai.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { plan } = await request.json();
  const priceId = plan === "yearly" ? STRIPE_PRICES.yearly : STRIPE_PRICES.monthly;

  if (!priceId) {
    return NextResponse.json(
      { error: "Les prix Stripe ne sont pas configurés. Exécutez /api/stripe/setup d'abord." },
      { status: 500 }
    );
  }

  try {
    const stripe = getStripe();
    const serviceClient = await createServiceClient();
    const appUrl = getAppUrl();

    // Vérifier si l'utilisateur a déjà un customer Stripe
    const { data: existingSub } = await serviceClient
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = existingSub?.stripe_customer_id;

    if (!customerId) {
      // Créer un customer Stripe
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Sauvegarder le customer
      await serviceClient.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        status: "inactive",
        plan: plan === "yearly" ? "yearly" : "monthly",
      });
    }

    // Créer la session checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: `${appUrl}/dashboard/abonnement?success=true`,
      cancel_url: `${appUrl}/dashboard/abonnement?canceled=true`,
      metadata: { user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 500 });
  }
}
