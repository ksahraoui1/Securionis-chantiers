import Stripe from "stripe";
import { getStripeSecretKey, getStripePriceMonthly, getStripePriceYearly } from "@/lib/env";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecretKey(), {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return stripeInstance;
}

export function getStripePrices() {
  return {
    monthly: getStripePriceMonthly(),
    yearly: getStripePriceYearly(),
  };
}
