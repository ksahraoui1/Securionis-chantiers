import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GestionMfa } from "@/components/compte/gestion-mfa";

export const metadata = { title: "Sécurité du compte" };

/**
 * Réglages de sécurité du compte — pour l'instant, le second facteur.
 *
 * Constat APP-03 de l'audit du 4 septembre 2026 : aucun des trois comptes ne
 * portait de second facteur, et celui de l'administrateur ouvre l'ensemble des
 * chantiers, des visites, la gestion des utilisateurs et le référentiel. Son
 * mot de passe était la seule chose qui protégeait le tout.
 */
export default async function PageSecurite() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: facteurs } = await supabase.auth.mfa.listFactors();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#002855] transition-colors"
        >
          <span translate="no" className="material-symbols-outlined text-base">arrow_back</span>
          Retour au tableau de bord
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-[#002855] mt-1">
          Sécurité du compte
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {user.email}
          {profile?.role ? ` · ${profile.role}` : ""}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">
          Second facteur d&apos;authentification
        </h2>
        <GestionMfa facteursInitiaux={facteurs?.all ?? []} />
      </section>
    </div>
  );
}
