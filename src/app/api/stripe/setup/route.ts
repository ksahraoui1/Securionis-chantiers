import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";

/**
 * POST /api/stripe/setup
 * Crée les produits et prix Stripe si ils n'existent pas encore.
 * À appeler une seule fois par un admin.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "administrateur") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  try {
    const stripe = getStripe();

    // Créer le produit
    const product = await stripe.products.create({
      name: "Securionis Chantiers — Inspecteur",
      description: "Accès complet : visites illimitées, rapports PDF, envoi email, photos",
    });

    // Prix mensuel : 29 CHF
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 2900,
      currency: "chf",
      recurring: { interval: "month" },
      metadata: { plan: "monthly" },
    });

    // Prix annuel : 260 CHF
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 26000,
      currency: "chf",
      recurring: { interval: "year" },
      metadata: { plan: "yearly" },
    });

    return NextResponse.json({
      product_id: product.id,
      monthly_price_id: monthlyPrice.id,
      yearly_price_id: yearlyPrice.id,
      message: "Ajoutez ces IDs dans .env.local : STRIPE_PRICE_MONTHLY et STRIPE_PRICE_YEARLY",
    });
  } catch (err) {
    console.error("Stripe setup error:", err);
    return NextResponse.json({ error: "Erreur lors de la configuration Stripe" }, { status: 500 });
  }
}
