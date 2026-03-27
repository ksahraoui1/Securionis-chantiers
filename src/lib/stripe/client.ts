import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/env";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecretKey(), {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return stripeInstance;
}

// Prix configurés — à remplacer par les IDs Stripe réels après création
// Ces IDs seront créés automatiquement via l'API ou le dashboard Stripe
export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY ?? "",
  yearly: process.env.STRIPE_PRICE_YEARLY ?? "",
};
