import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/env";

/**
 * Vérifie que l'utilisateur a accès à une visite donnée.
 * Retourne true si l'utilisateur est l'inspecteur de la visite,
 * est assigné au chantier de la visite, ou est administrateur.
 */
export async function canAccessVisite(
  supabase: SupabaseClient,
  userId: string,
  visiteId: string
): Promise<boolean> {
  // Charger la visite (RLS appliquée)
  const { data: visite } = await supabase
    .from("visites")
    .select("id, inspecteur_id, chantier_id")
    .eq("id", visiteId)
    .single();

  if (!visite) return false;

  // L'inspecteur de la visite a toujours accès
  if (visite.inspecteur_id === userId) return true;

  // Vérifier si admin
  const role = await getUserRole(supabase, userId);
  if (role === "administrateur") return true;

  // Vérifier si assigné au chantier
  const { data: assignment } = await supabase
    .from("chantier_inspecteurs")
    .select("id")
    .eq("chantier_id", visite.chantier_id)
    .eq("inspecteur_id", userId)
    .single();

  return !!assignment;
}

/**
 * Vérifie que l'utilisateur a accès à un chantier donné.
 */
export async function canAccessChantier(
  supabase: SupabaseClient,
  userId: string,
  chantierId: string
): Promise<boolean> {
  const role = await getUserRole(supabase, userId);
  if (role === "administrateur") return true;

  const { data } = await supabase
    .from("chantier_inspecteurs")
    .select("id")
    .eq("chantier_id", chantierId)
    .eq("inspecteur_id", userId)
    .single();

  return !!data;
}

/**
 * Retourne le rôle de l'utilisateur.
 */
export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return data?.role ?? null;
}

/**
 * Échappe les caractères HTML pour prévenir XSS dans les emails.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Valide que l'URL appartient au projet Supabase.
 * Whitelist stricte par hostname exact.
 */
export function isAllowedSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supabaseUrl = getSupabaseUrl();
    if (!supabaseUrl) return false;

    const allowedHostname = new URL(supabaseUrl).hostname;
    return parsed.hostname === allowedHostname;
  } catch {
    return false;
  }
}

/**
 * Valide la complexité d'un mot de passe.
 * Retourne null si valide, un message d'erreur sinon.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères";
  }
  if (!/[A-Z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une majuscule";
  }
  if (!/[a-z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une minuscule";
  }
  if (!/[0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins un chiffre";
  }
  return null;
}
