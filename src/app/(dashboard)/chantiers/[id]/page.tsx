import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DestinatairesSection } from "@/components/chantier/destinataire-list";
import { DocumentManager } from "@/components/chantier/document-manager";
import { TimelineVisites } from "@/components/chantier/timeline-visites";
import { VisiteCompare } from "@/components/visite/visite-compare";
import { EcartListWithActions } from "./ecart-list-actions";
import { ArchiveToggleButton } from "@/components/chantier/archive-toggle-button";

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
    <div className="max-w-2xl mx-auto px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
              {chantier.nom || chantier.adresse}
            </h1>
            {chantier.archived ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <span className="material-symbols-outlined text-xs">inventory_2</span>
                Archivé
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                Actif
              </span>
            )}
          </div>
          {chantier.nom && (
            <p className="text-sm text-gray-600 mt-0.5 break-words">{chantier.adresse}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {chantier.nature_travaux}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/export/xlsx?scope=chantier&chantierId=${chantierId}`}
            download
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            title="Export Excel"
          >
            <span className="material-symbols-outlined text-lg">download</span>
          </a>
          <ArchiveToggleButton chantierId={chantierId} archived={chantier.archived} />
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
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Visites</h2>
          {!chantier.archived && (
            <Link
              href={`/chantiers/${chantierId}/visites/nouvelle`}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Nouvelle visite
            </Link>
          )}
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
