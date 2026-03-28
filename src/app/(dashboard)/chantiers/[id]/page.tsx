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

  // Count NC per visite + detect corrected visits for timeline
  const visiteIds = visites?.map((v) => v.id) ?? [];
  let ncCountByVisite: Record<string, number> = {};
  const ncReponsesByVisite: Record<string, string[]> = {};

  if (visiteIds.length > 0) {
    const { data: ncReponses } = await supabase
      .from("reponses")
      .select("id, visite_id")
      .in("visite_id", visiteIds)
      .eq("valeur", "non_conforme");

    if (ncReponses) {
      for (const r of ncReponses) {
        ncCountByVisite[r.visite_id] =
          (ncCountByVisite[r.visite_id] ?? 0) + 1;
        if (!ncReponsesByVisite[r.visite_id]) ncReponsesByVisite[r.visite_id] = [];
        ncReponsesByVisite[r.visite_id].push(r.id);
      }
    }
  }

  // Detect visits where ALL NC are corrected
  const ecartByReponseId = new Map(
    (ecarts ?? []).map((e) => [e.reponse_id, e.statut])
  );

  function isVisiteAllCorrected(visiteId: string): boolean {
    const ncIds = ncReponsesByVisite[visiteId];
    if (!ncIds || ncIds.length === 0) return false;
    return ncIds.every((rId) => ecartByReponseId.get(rId) === "corrige");
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
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 stagger-children">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/chantiers"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-heading text-xl sm:text-2xl font-bold text-gray-900 break-words">
                {chantier.nom || chantier.adresse}
              </h1>
              {chantier.archived ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10">
                  <span className="material-symbols-outlined text-xs">inventory_2</span>
                  Archivé
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                  Actif
                </span>
              )}
            </div>
          </div>
          {chantier.nom && (
            <p className="text-sm text-gray-500 mt-0.5 break-words">{chantier.adresse}</p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            {chantier.nature_travaux}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/export/xlsx?scope=chantier&chantierId=${chantierId}`}
            download
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-sm"
            title="Export Excel"
          >
            <span className="material-symbols-outlined text-lg">download</span>
          </a>
          <ArchiveToggleButton chantierId={chantierId} archived={chantier.archived} />
          <Link
            href={`/chantiers/${chantierId}/modifier`}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm bg-white text-gray-700 border border-stone-200 rounded-xl hover:bg-stone-50 transition-all font-medium shadow-subtle"
          >
            <span className="material-symbols-outlined text-base mr-1.5">edit</span>
            Modifier
          </Link>
        </div>
      </div>

      {/* Info chantier */}
      <Card title="Informations" icon="info">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-4">
          {chantier.ref_communale && (
            <>
              <dt className="text-gray-400">Ref. communale</dt>
              <dd className="text-gray-900 font-medium">{chantier.ref_communale}</dd>
            </>
          )}
          {chantier.numero_camac && (
            <>
              <dt className="text-gray-400">N. CAMAC</dt>
              <dd className="text-gray-900 font-medium">{chantier.numero_camac}</dd>
            </>
          )}
          {chantier.numero_parcelle && (
            <>
              <dt className="text-gray-400">N. parcelle</dt>
              <dd className="text-gray-900 font-medium">{chantier.numero_parcelle}</dd>
            </>
          )}
          {chantier.numero_eca && (
            <>
              <dt className="text-gray-400">N. ECA</dt>
              <dd className="text-gray-900 font-medium">{chantier.numero_eca}</dd>
            </>
          )}
          {chantier.contact_nom && (
            <>
              <dt className="text-gray-400">Contact</dt>
              <dd className="text-gray-900 font-medium">{chantier.contact_nom}</dd>
            </>
          )}
        </dl>
      </Card>

      {/* Documents */}
      <Card title="Documents" icon="folder_open">
        <div className="mt-4">
          <DocumentManager
            chantierId={chantierId}
            initialDocuments={documents ?? []}
          />
        </div>
      </Card>

      {/* Destinataires */}
      <Card title="Destinataires" icon="mail">
        <div className="mt-4">
          <DestinatairesSection
            chantierId={chantierId}
            initialDestinataires={destinataires ?? []}
          />
        </div>
      </Card>

      {/* Bandeau : NC corrigées → régénérer rapport */}
      {visites?.filter((v) => v.statut === "terminee" && isVisiteAllCorrected(v.id)).map((v) => (
        <div key={`corrected-${v.id}`} className="rounded-2xl bg-emerald-50 border border-emerald-200/60 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-emerald-600 text-xl">task_alt</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  Toutes les NC de la visite du {new Date(v.date_visite).toLocaleDateString("fr-CH")} sont corrigées
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Vous pouvez générer un rapport mis à jour et l&apos;envoyer par email.
                </p>
              </div>
            </div>
            <Link
              href={`/chantiers/${chantierId}/visites/${v.id}/rapport`}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-all text-sm shrink-0 shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
              Générer le rapport
            </Link>
          </div>
        </div>
      ))}

      {/* Visites */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-heading text-lg font-bold text-gray-900">Visites</h2>
          {!chantier.archived && (
            <Link
              href={`/chantiers/${chantierId}/visites/nouvelle`}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all text-sm w-full sm:w-auto shadow-sm hover:shadow-md"
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
        <h2 className="font-heading text-lg font-bold text-gray-900 mb-4">Non-conformités</h2>
        <EcartListWithActions ecarts={ecarts ?? []} />
      </div>
    </div>
  );
}
