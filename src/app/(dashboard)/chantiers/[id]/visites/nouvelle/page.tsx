import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NouvelleVisiteForm } from "./nouvelle-visite-form";

export default async function NouvelleVisitePage({
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

  // Check if there is an existing non-terminated visite for this chantier
  const { data: existingVisite } = await supabase
    .from("visites")
    .select("id")
    .eq("chantier_id", chantierId)
    .neq("statut", "terminee")
    .limit(1)
    .maybeSingle();

  if (existingVisite) {
    redirect(`/chantiers/${chantierId}/visites/${existingVisite.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Nouvelle visite
      </h1>
      <NouvelleVisiteForm chantierId={chantierId} inspecteurId={user.id} />
    </div>
  );
}
