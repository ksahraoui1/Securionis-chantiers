import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EcranVerification } from "./ecran-verification";

export const metadata = { title: "Vérification en deux étapes" };

/**
 * Point de passage pour une session restée au niveau simple alors qu'un second
 * facteur est enregistré.
 *
 * Le cas normal — code demandé juste après le mot de passe — est traité sur la
 * page de connexion. Celui-ci couvre le reste : session ouverte avant
 * l'enrôlement, onglet laissé de côté, retour sur l'application le lendemain.
 * Le layout du tableau de bord redirige ici.
 */
export default async function PageVerification() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: mfaValide, error } = await supabase.rpc("session_mfa_valide");
  if (error || typeof mfaValide !== "boolean") {
    throw new Error("Vérification de sécurité indisponible. Réessayez plus tard.");
  }
  if (mfaValide) redirect("/dashboard");
  const { data: facteurs, error: erreurFacteurs } = await supabase.auth.mfa.listFactors();
  const facteur = facteurs?.all.find((f) => f.status === "verified");
  if (erreurFacteurs || !facteur) {
    throw new Error("Impossible de charger le second facteur. Réessayez la connexion.");
  }

  return <EcranVerification factorId={facteur.id} email={user.email ?? ""} />;
}
