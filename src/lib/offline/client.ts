import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/env";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";

/** Capturer le JWT : une attente réseau ne doit jamais emprunter le compte suivant. */
export async function createOfflineClient(scope: OfflineScope) {
  assertOfflineScope(scope);
  const auth = createClient().auth;
  const { data: { session }, error } = await auth.getSession();
  if (error || !session || session.user.id !== scope.userId) throw new Error("Session différente de la file locale");
  const token = session.access_token;
  const { data: { user }, error: userError } = await auth.getUser(token);
  assertOfflineScope(scope);
  if (userError || user?.id !== scope.userId) throw new Error("Session non vérifiée");
  const client = createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    accessToken: async () => token,
    global: { fetch: (input, init) => {
      assertOfflineScope(scope);
      const signals = [scope.signal, AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])];
      return fetch(input, { ...init, signal: AbortSignal.any(signals) });
    } },
  });
  const [mfa, profile] = await Promise.all([
    client.rpc("session_mfa_valide"),
    client.from("profiles").select("entreprise_id").eq("id", scope.userId).single(),
  ]);
  assertOfflineScope(scope);
  if (mfa.error || mfa.data !== true || profile.error || !profile.data || (profile.data.entreprise_id ?? null) !== scope.entrepriseId) {
    throw new Error("La session, le second facteur ou l’entreprise ne correspond plus aux données locales");
  }
  return client;
}
