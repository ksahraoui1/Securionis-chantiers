import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { VisiteEnCours } from "./visite-en-cours";

export default async function VisitePage({
  params,
}: {
  params: Promise<{ id: string; visiteId: string }>;
}) {
  const { id: chantierId, visiteId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load visite (including categorie_ids)
  const { data: visite } = await supabase
    .from("visites")
    .select("*")
    .eq("id", visiteId)
    .eq("chantier_id", chantierId)
    .single();

  if (!visite) {
    notFound();
  }

  // If visite is already completed, redirect to rapport
  if (visite.statut === "terminee") {
    redirect(`/chantiers/${chantierId}/visites/${visiteId}/rapport`);
  }

  // Load existing reponses keyed by point_controle_id
  const { data: reponses } = await supabase
    .from("reponses")
    .select("id, point_controle_id, valeur, remarque, photos")
    .eq("visite_id", visiteId);

  const existingReponses: Record<
    string,
    { id: string; valeur: string; remarque: string | null; photos: string[] }
  > = {};
  if (reponses) {
    for (const r of reponses) {
      existingReponses[r.point_controle_id] = {
        id: r.id,
        valeur: r.valeur,
        remarque: r.remarque,
        photos: r.photos ?? [],
      };
    }
  }

  // Get categorieIds from the visite record
  const categorieIds: string[] = visite.categorie_ids ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Visite en cours
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {new Date(visite.date_visite).toLocaleDateString("fr-CH")}
      </p>
      <VisiteEnCours
        visiteId={visiteId}
        chantierId={chantierId}
        categorieIds={categorieIds}
        existingReponses={existingReponses}
      />
    </div>
  );
}
