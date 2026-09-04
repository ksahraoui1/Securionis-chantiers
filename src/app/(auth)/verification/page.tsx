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

  const { data: niveaux } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // Rien à vérifier : soit aucun facteur, soit déjà au niveau requis.
  if (!niveaux || niveaux.currentLevel === niveaux.nextLevel) {
    redirect("/dashboard");
  }

  const { data: facteurs } = await supabase.auth.mfa.listFactors();
  const facteur = (facteurs?.all ?? []).find((f) => f.status === "verified");

  // Aucun facteur vérifié malgré un niveau attendu supérieur : incohérence,
  // on laisse passer plutôt que d'enfermer l'utilisateur dehors.
  if (!facteur) redirect("/dashboard");

  return <EcranVerification factorId={facteur.id} email={user.email ?? ""} />;
}
