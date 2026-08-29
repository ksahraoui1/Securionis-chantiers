import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { RapportActions } from "./rapport-actions";
import { EmailHistory } from "./email-history";
import { extractRapportStoragePath } from "@/lib/utils/security";

export default async function RapportPage({
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

  // Load visite with chantier info
  const { data: visite } = await supabase
    .from("visites")
    .select("*")
    .eq("id", visiteId)
    .eq("chantier_id", chantierId)
    .single();

  if (!visite) {
    notFound();
  }

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("*")
    .eq("id", chantierId)
    .single();

  // Load reponses
  const { data: reponses } = await supabase
    .from("reponses")
    .select("*")
    .eq("visite_id", visiteId);

  // Load ecarts for this chantier
  const { data: ecarts } = await supabase
    .from("ecarts")
    .select("*")
    .eq("chantier_id", chantierId)
    .order("created_at", { ascending: false });

  // Load destinataires
  const { data: destinataires } = await supabase
    .from("destinataires")
    .select("*")
    .eq("chantier_id", chantierId);

  // Load email history (bypass RLS via serviceClient — autorisation déjà vérifiée
  // par l'accès à cette page via le chantier_id)
  const serviceClientForHistory = await createServiceClient();
  const { data: rawLogs } = await serviceClientForHistory
    .from("audit_logs")
    .select("id, user_id, created_at, details")
    .eq("action", "send_rapport_email")
    .eq("resource_id", visiteId)
    .order("created_at", { ascending: false });

  const senderIds = Array.from(
    new Set((rawLogs ?? []).map((l) => l.user_id).filter((id): id is string => !!id)),
  );
  const sendersById = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: senders } = await serviceClientForHistory
      .from("profiles")
      .select("id, nom")
      .in("id", senderIds);
    (senders ?? []).forEach((s) => sendersById.set(s.id, s.nom));
  }

  const emailHistory = (rawLogs ?? []).map((log) => {
    const details = log.details as { sent_to?: unknown } | null;
    const sentTo = Array.isArray(details?.sent_to)
      ? (details.sent_to as unknown[]).filter(
          (e): e is string => typeof e === "string",
        )
      : [];
    return {
      id: log.id,
      createdAt: log.created_at,
      senderName:
        (log.user_id && sendersById.get(log.user_id)) ?? "Utilisateur supprimé",
      sentTo,
    };
  });

  // Générer une signed URL pour le rapport PDF (bucket privé)
  let signedRapportUrl: string | null = null;
  if (visite.rapport_url) {
    try {
      const serviceClient = await createServiceClient();
      const storagePath = extractRapportStoragePath(visite.rapport_url);
      const { data: signedData } = await serviceClient.storage
        .from("rapports")
        .createSignedUrl(storagePath, 3600); // valide 1 heure
      signedRapportUrl = signedData?.signedUrl ?? null;
    } catch {
      // Si extraction du chemin échoue (URL malformée), ignorer
    }
  }

  const ncCount =
    reponses?.filter((r) => r.valeur === "non_conforme").length ?? 0;
  const conformeCount =
    reponses?.filter((r) => r.valeur === "conforme").length ?? 0;
  const totalReponses = reponses?.length ?? 0;

  // Détecter si toutes les NC de cette visite sont corrigées
  const ncReponseIds = new Set(
    reponses?.filter((r) => r.valeur === "non_conforme").map((r) => r.id) ?? []
  );
  const visiteEcarts = ecarts?.filter((e) => ncReponseIds.has(e.reponse_id)) ?? [];
  const allNcCorrected = visiteEcarts.length > 0 && visiteEcarts.every((e) => e.statut === "corrige");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Rapport de visite
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {chantier?.adresse} &mdash;{" "}
        {new Date(visite.date_visite).toLocaleDateString("fr-CH")}
      </p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-400 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalReponses}</p>
          <p className="text-xs text-gray-500">Points</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-400 text-center">
          <p className="text-2xl font-bold text-green-600">{conformeCount}</p>
          <p className="text-xs text-gray-500">Conformes</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-400 text-center">
          <p className="text-2xl font-bold text-red-600">{ncCount}</p>
          <p className="text-xs text-gray-500">Non-conformes</p>
        </div>
      </div>

      {/* Bandeau NC toutes corrigées */}
      {allNcCorrected && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-6">
          <div className="flex items-start gap-3">
            <span translate="no" className="material-symbols-outlined text-green-600 text-2xl">check_circle</span>
            <div>
              <p className="text-sm font-semibold text-green-800">
                Toutes les non-conformités de la visite du{" "}
                {new Date(visite.date_visite).toLocaleDateString("fr-CH")} ont été corrigées
              </p>
              <p className="text-xs text-green-700 mt-1">
                Vous pouvez régénérer le rapport PDF mis à jour et l&apos;envoyer par email aux destinataires.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ecarts summary */}
      {visiteEcarts.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-400 mb-6">
          <h2 className="text-lg font-semibold mb-3">Non-conformités</h2>
          <ul className="space-y-2">
            {visiteEcarts.map((ecart) => (
              <li
                key={ecart.id}
                className="flex items-start justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {ecart.statut === "corrige" ? (
                    <span translate="no" className="material-symbols-outlined text-green-500 text-base shrink-0">check_circle</span>
                  ) : (
                    <span translate="no" className="material-symbols-outlined text-red-500 text-base shrink-0">error</span>
                  )}
                  <span className={`${ecart.statut === "corrige" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                    {ecart.description}
                  </span>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                  {ecart.delai ?? "Pas de délai"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status indicators */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-400 mb-6 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          {visite.rapport_url ? (
            <span className="text-green-600 font-medium flex items-center gap-1">
              <span translate="no" className="material-symbols-outlined text-sm">check_circle</span>
              PDF généré
            </span>
          ) : (
            <span className="text-gray-400">PDF non généré</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {visite.email_envoye ? (
            <span className="text-green-600 font-medium flex items-center gap-1">
              <span translate="no" className="material-symbols-outlined text-sm">check_circle</span>
              Email envoyé
            </span>
          ) : (
            <span className="text-gray-400">Email non envoyé</span>
          )}
        </div>
      </div>

      {/* Destinataires warning */}
      {(!destinataires || destinataires.length === 0) && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-6">
          <p className="text-sm text-amber-800">
            Aucun destinataire configure pour ce chantier. Ajoutez des
            destinataires dans la fiche chantier avant d&apos;envoyer le
            rapport.
          </p>
        </div>
      )}

      <RapportActions
        visiteId={visiteId}
        hasRapportUrl={!!visite.rapport_url}
        rapportUrl={signedRapportUrl}
        emailEnvoye={visite.email_envoye}
        destinataires={destinataires ?? []}
      />

      <EmailHistory entries={emailHistory} />
    </div>
  );
}
