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

  const { data: profile } = await supabase
    .from("profiles")
    .select("nom, role, entreprise_id")
    .eq("id", user.id)
    .single();

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
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-8">
        &copy;2026 - BTP-UP
      </footer>
    </div>
  );
}
