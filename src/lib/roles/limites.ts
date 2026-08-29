import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Limites de fonctionnalités **par rôle**.
 *
 * Ce module vivait dans `lib/stripe/`, ce qui laissait croire qu'il dépendait
 * d'un abonnement. Il n'en a jamais rien fait : il ne lit pas la table
 * `subscriptions` et ne connaît que le rôle du profil. Le retrait de Stripe
 * (août 2026) ne l'a donc pas touché — seul son emplacement était trompeur.
 *
 * Six routes métier s'en servent pour autoriser la génération de PDF et l'envoi
 * d'emails : un compte « invité » ne peut faire ni l'un ni l'autre.
 */
export const PLAN_LIMITS = {
  invité: {
    maxChantiers: 2,
    maxVisitesParChantier: 1,
    maxPhotosParVisite: 1,
    canGeneratePdf: false,
    canSendEmail: false,
    watermark: true,
  },
  inspecteur: {
    maxChantiers: Infinity,
    maxVisitesParChantier: Infinity,
    maxPhotosParVisite: 10,
    canGeneratePdf: true,
    canSendEmail: true,
    watermark: false,
  },
  administrateur: {
    maxChantiers: Infinity,
    maxVisitesParChantier: Infinity,
    maxPhotosParVisite: 10,
    canGeneratePdf: true,
    canSendEmail: true,
    watermark: false,
  },
} as const;

export type UserRole = keyof typeof PLAN_LIMITS;

export function getLimits(role: string) {
  return PLAN_LIMITS[role as UserRole] ?? PLAN_LIMITS["invité"];
}

/**
 * Vérifie si l'utilisateur peut créer un nouveau chantier.
 */
export async function canCreateChantier(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<{ allowed: boolean; reason?: string; current?: number; max?: number }> {
  const limits = getLimits(role);
  if (limits.maxChantiers === Infinity) return { allowed: true };

  const { count } = await supabase
    .from("chantier_inspecteurs")
    .select("id", { count: "exact", head: true })
    .eq("inspecteur_id", userId);

  const current = count ?? 0;
  if (current >= limits.maxChantiers) {
    return {
      allowed: false,
      reason: `Limite de ${limits.maxChantiers} chantier${limits.maxChantiers > 1 ? "s" : ""} atteinte. Passez à l'offre payante pour créer plus de chantiers.`,
      current,
      max: limits.maxChantiers,
    };
  }
  return { allowed: true, current, max: limits.maxChantiers };
}

/**
 * Vérifie si l'utilisateur peut créer une visite sur un chantier.
 */
export async function canCreateVisite(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  chantierId: string
): Promise<{ allowed: boolean; reason?: string; current?: number; max?: number }> {
  const limits = getLimits(role);
  if (limits.maxVisitesParChantier === Infinity) return { allowed: true };

  const { count } = await supabase
    .from("visites")
    .select("id", { count: "exact", head: true })
    .eq("chantier_id", chantierId)
    .eq("inspecteur_id", userId);

  const current = count ?? 0;
  if (current >= limits.maxVisitesParChantier) {
    return {
      allowed: false,
      reason: `Limite de ${limits.maxVisitesParChantier} visite${limits.maxVisitesParChantier > 1 ? "s" : ""} par chantier atteinte. Passez à l'offre payante pour des visites illimitées.`,
      current,
      max: limits.maxVisitesParChantier,
    };
  }
  return { allowed: true, current, max: limits.maxVisitesParChantier };
}
