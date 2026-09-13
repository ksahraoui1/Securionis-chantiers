import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ApiSession =
  | { user: User; response: null }
  | { user: null; response: NextResponse };

/** Même décision que les politiques RLS, y compris après un nouvel enrôlement. */
export async function requireApiUser(supabase: SupabaseClient): Promise<ApiSession> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return { user: null, response: NextResponse.json(
        { error: "Non authentifié" }, { status: 401 },
      ) };
    }
    const { data: autorisee, error: mfaError } = await supabase.rpc("session_mfa_valide");
    if (mfaError || typeof autorisee !== "boolean") {
      return { user: null, response: NextResponse.json(
        { error: "Vérification de sécurité indisponible. Réessayez plus tard." },
        { status: 503 },
      ) };
    }
    if (!autorisee) {
      return { user: null, response: NextResponse.json(
        { error: "Validez votre second facteur pour continuer.", code: "MFA_REQUIRED" },
        { status: 403 },
      ) };
    }
    return { user, response: null };
  } catch {
    return { user: null, response: NextResponse.json(
      { error: "Vérification de sécurité indisponible. Réessayez plus tard." },
      { status: 503 },
    ) };
  }
}
