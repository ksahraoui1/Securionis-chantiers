import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ChantierForm } from "@/components/chantier/chantier-form";
import { InspecteurAttribution } from "./inspecteur-attribution";

export default async function ModifierChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chantierId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("*")
    .eq("id", chantierId)
    .single();

  if (!chantier) {
    notFound();
  }

  // Load user profile to check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "administrateur";

  // Load current inspecteurs for this chantier (admin only)
  let currentInspecteurs: { id: string; inspecteur_id: string; nom: string }[] =
    [];
  let allInspecteurs: { id: string; nom: string; email: string }[] = [];

  if (isAdmin) {
    const { data: chantierInsp } = await supabase
      .from("chantier_inspecteurs")
      .select("id, inspecteur_id, profiles:inspecteur_id(nom)")
      .eq("chantier_id", chantierId);

    currentInspecteurs =
      chantierInsp?.map((ci) => ({
        id: ci.id,
        inspecteur_id: ci.inspecteur_id,
        nom:
          (ci.profiles as unknown as { nom: string } | null)?.nom ?? "Inconnu",
      })) ?? [];

    const { data: inspecteurs } = await supabase
      .from("profiles")
      .select("id, nom, email")
      .eq("role", "inspecteur");

    allInspecteurs = inspecteurs ?? [];
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Modifier le chantier
      </h1>

      <ChantierForm
        userId={user.id}
        userRole={profile?.role ?? "inspecteur"}
        chantierId={chantierId}
        initialData={{
          nom: chantier.nom ?? "",
          adresse: chantier.adresse,
          nature_travaux: chantier.nature_travaux,
          ref_communale: chantier.ref_communale ?? "",
          numero_camac: chantier.numero_camac ?? "",
          numero_parcelle: chantier.numero_parcelle ?? "",
          numero_eca: chantier.numero_eca ?? "",
          contact_nom: chantier.contact_nom ?? "",
        }}
      />

      {isAdmin && (
        <InspecteurAttribution
          chantierId={chantierId}
          currentInspecteurs={currentInspecteurs}
          allInspecteurs={allInspecteurs}
        />
      )}
    </div>
  );
}
