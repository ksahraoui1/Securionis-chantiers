import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DestinatairesSection } from "@/components/chantier/destinataire-list";
import { DocumentManager } from "@/components/chantier/document-manager";
import { TimelineVisites } from "@/components/chantier/timeline-visites";
import { VisiteCompare } from "@/components/visite/visite-compare";
import { EcartListWithActions } from "./ecart-list-actions";

export default async function ChantierDetailPage({
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

  const { data: destinataires } = await supabase
    .from("destinataires")
    .select("*")
    .eq("chantier_id", chantierId)
    .order("nom");

  // Load visites with inspecteur name
  const { data: visites } = await supabase
    .from("visites")
    .select("*, profiles:inspecteur_id(nom)")
    .eq("chantier_id", chantierId)
    .order("date_visite", { ascending: false });

  // Load ecarts
  const { data: ecarts } = await supabase
    .from("ecarts")
    .select("*")
    .eq("chantier_id", chantierId)
    .order("created_at", { ascending: false });

  // Load documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("chantier_id", chantierId)
    .order("categorie")
    .order("nom");

  // Count NC per visite for timeline
  const visiteIds = visites?.map((v) => v.id) ?? [];
  let ncCountByVisite: Record<string, number> = {};

  if (visiteIds.length > 0) {
    const { data: ncReponses } = await supabase
      .from("reponses")
      .select("visite_id")
      .in("visite_id", visiteIds)
      .eq("valeur", "non_conforme");

    if (ncReponses) {
      for (const r of ncReponses) {
        ncCountByVisite[r.visite_id] =
          (ncCountByVisite[r.visite_id] ?? 0) + 1;
      }
    }
  }

  const visitesForTimeline =
    visites?.map((v) => ({
      id: v.id,
      date_visite: v.date_visite,
      statut: v.statut,
      rapport_url: v.rapport_url,
      inspecteur_nom:
        (v.profiles as unknown as { nom: string } | null)?.nom ?? "Inconnu",
      nc_count: ncCountByVisite[v.id] ?? 0,
    })) ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {chantier.nom || chantier.adresse}
          </h1>
          {chantier.nom && (
            <p className="text-sm text-gray-600 mt-0.5">{chantier.adresse}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {chantier.nature_travaux}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export/xlsx?scope=chantier&chantierId=${chantierId}`}
            download
            className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            title="Export Excel"
          >
            <span className="material-symbols-outlined text-lg">download</span>
          </a>
          <Link
            href={`/chantiers/${chantierId}/modifier`}
            className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Modifier
          </Link>
        </div>
      </div>

      {/* Info chantier */}
      <Card title="Informations">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {chantier.ref_communale && (
            <>
              <dt className="text-gray-500">Ref. communale</dt>
              <dd className="text-gray-900">{chantier.ref_communale}</dd>
            </>
          )}
          {chantier.numero_camac && (
            <>
              <dt className="text-gray-500">N. CAMAC</dt>
              <dd className="text-gray-900">{chantier.numero_camac}</dd>
            </>
          )}
          {chantier.numero_parcelle && (
            <>
              <dt className="text-gray-500">N. parcelle</dt>
              <dd className="text-gray-900">{chantier.numero_parcelle}</dd>
            </>
          )}
          {chantier.numero_eca && (
            <>
              <dt className="text-gray-500">N. ECA</dt>
              <dd className="text-gray-900">{chantier.numero_eca}</dd>
            </>
          )}
          {chantier.contact_nom && (
            <>
              <dt className="text-gray-500">Contact</dt>
              <dd className="text-gray-900">{chantier.contact_nom}</dd>
            </>
          )}
        </dl>
      </Card>

      {/* Documents */}
      <Card title="Documents">
        <DocumentManager
          chantierId={chantierId}
          initialDocuments={documents ?? []}
        />
      </Card>

      {/* Destinataires */}
      <Card title="Destinataires">
        <DestinatairesSection
          chantierId={chantierId}
          initialDestinataires={destinataires ?? []}
        />
      </Card>

      {/* Visites */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Visites</h2>
          <Link
            href={`/chantiers/${chantierId}/visites/nouvelle`}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Nouvelle visite
          </Link>
        </div>
        <TimelineVisites
          visites={visitesForTimeline}
          chantierId={chantierId}
        />
      </div>

      {/* Comparaison visites */}
      {visitesForTimeline.length >= 2 && (
        <div>
          <VisiteCompare visites={visitesForTimeline} />
        </div>
      )}

      {/* Non-conformités */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Non-conformités</h2>
        <EcartListWithActions ecarts={ecarts ?? []} />
      </div>
    </div>
  );
}
