import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "./nav";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { signerUrl } from "@/lib/utils/url-signee";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Second facteur (APP-03). Une session obtenue par mot de passe reste au
  // niveau simple ; si un facteur est enregistré, Supabase annonce un niveau
  // attendu supérieur et la session n'est pas complète tant que le code n'a pas
  // été fourni. Le cas courant est traité sur la page de connexion ; ceci
  // rattrape les sessions ouvertes avant l'enrôlement ou laissées de côté.
  const { data: niveaux } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveaux && niveaux.currentLevel !== niveaux.nextLevel) {
    redirect("/verification");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nom, role, entreprise_id")
    .eq("id", user.id)
    .single();

  // Un compte administrateur ouvre tous les chantiers, toutes les visites, la
  // gestion des utilisateurs et le référentiel : son mot de passe ne devrait
  // pas être la seule protection. Invitation, jamais blocage — verrouiller
  // l'accès tant que le facteur n'est pas posé enfermerait dehors.
  let inviterAuSecondFacteur = false;
  if (profile?.role === "administrateur") {
    const { data: facteurs } = await supabase.auth.mfa.listFactors();
    inviterAuSecondFacteur = !(facteurs?.all ?? []).some(
      (f) => f.status === "verified",
    );
  }

  // Load entreprise if user has one
  let entrepriseNom: string | null = null;
  let entrepriseLogoUrl: string | null = null;

  if (profile?.entreprise_id) {
    const { data: entreprise } = await supabase
      .from("entreprises")
      .select("nom, logo_url")
      .eq("id", profile.entreprise_id)
      .single();
    if (entreprise) {
      entrepriseNom = entreprise.nom;
      entrepriseLogoUrl = entreprise.logo_url;
    }
  } else {
    // Fallback: load first entreprise if exists
    const { data: entreprise } = await supabase
      .from("entreprises")
      .select("nom, logo_url")
      .limit(1)
      .maybeSingle();
    if (entreprise) {
      entrepriseNom = entreprise.nom;
      entrepriseLogoUrl = entreprise.logo_url;
    }
  }

  // Le bucket est privé (SEC-03) : le logo se sert par URL signée.
  const logoSigne = await signerUrl(supabase, entrepriseLogoUrl);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav
        userName={profile?.nom ?? user.email ?? ""}
        userRole={profile?.role ?? "inspecteur"}
        entrepriseNom={entrepriseNom}
        entrepriseLogoUrl={logoSigne}
      />
      <OfflineBanner />
      {inviterAuSecondFacteur && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-start sm:items-center gap-3 flex-wrap">
            <span
              translate="no"
              className="material-symbols-outlined text-amber-700 text-lg"
            >
              shield_question
            </span>
            <p className="text-sm text-amber-900 flex-1 min-w-[16rem]">
              Votre compte administrateur ouvre l&apos;ensemble des chantiers et la
              gestion des utilisateurs, et n&apos;est protégé que par son mot de passe.
            </p>
            <Link
              href="/compte/securite"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-touch rounded-lg bg-[#002855] text-white text-sm font-medium hover:bg-[#002855]/90 whitespace-nowrap"
            >
              Activer le second facteur
            </Link>
          </div>
        </div>
      )}
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-8">
        &copy;2026 - BTP-UP
      </footer>
    </div>
  );
}
