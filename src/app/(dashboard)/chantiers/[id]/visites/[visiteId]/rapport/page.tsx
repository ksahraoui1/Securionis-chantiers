import { ArchiveSources } from "@/components/visite/archive-sources";
import { canAccessChantier, getUserRole } from "@/lib/utils/security";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { RapportActions } from "./rapport-actions";
import { EmailHistory } from "./email-history";
import { verifierRapportVisite } from "@/lib/utils/storage-reference";
import { requireApiUser } from "@/lib/supabase/require-api-user";

export default async function RapportPage({
  params,
}: {
  params: Promise<{ id: string; visiteId: string }>;
}) {
  const { id: chantierId, visiteId } = await params;
  const supabase = await createClient();

  const { user, response: authResponse } = await requireApiUser(supabase);
  if (authResponse) {
    if (authResponse.status === 401) redirect("/login");
    if (authResponse.status === 403) redirect("/verification");
    throw new Error("Vérification de sécurité indisponible.");
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
      const storagePath = verifierRapportVisite(visite.rapport_url, visite);
      const { data: signedData } = await supabase.storage
        .from("rapports")
        .createSignedUrl(storagePath, 3600); // valide 1 heure
      signedRapportUrl = signedData?.signedUrl ?? null;
    } catch {
      // Si extraction du chemin échoue (URL malformée), ignorer
    }
  }

  const { data: versions, error: versionsError } = await supabase.from("rapport_versions")
    .select("id, storage_path, sha256, auteur_nom, motif, historique, created_at")
    .eq("visite_id", visiteId).order("created_at", { ascending: false }).limit(50);
  const historiqueVersions = await Promise.all((versions ?? []).map(async (version) => {
    try {
      const chemin = verifierRapportVisite(version.storage_path, visite);
      const { data } = await supabase.storage.from("rapports").createSignedUrl(chemin, 3600);
      return { ...version, url: data?.signedUrl ?? null };
    } catch { return { ...version, url: null }; }
  }));

  const { data: archive, error: archiveError } = await supabase.from("visite_archives").select("id,mode,sha256,created_at").eq("visite_id", visiteId).maybeSingle();
  const role = await getUserRole(supabase, user.id);
  const peutArchiver = (role === "administrateur" || role === "inspecteur") && await canAccessChantier(supabase, user.id, chantierId);
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
                Le suivi des corrections est à jour ci-dessous. Les constats et les sources archivés restent ceux de la visite.
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

      {(role === "administrateur" || role === "inspecteur") && <ArchiveSources visiteId={visiteId} auteurId={user.id} archive={archive} erreur={!!archiveError} editable={peutArchiver} />}

      <RapportActions
        visiteId={visiteId}
        hasRapportUrl={!!visite.rapport_url}
        rapportUrl={signedRapportUrl}
        rapportReference={visite.rapport_url}
        emailEnvoye={visite.email_envoye}
        destinataires={destinataires ?? []}
      />

      <section className="mt-8 rounded-lg border border-gray-300 bg-white p-4">
        <h2 className="text-lg font-semibold">Historique des rapports</h2>
        {versionsError && <p className="mt-2 text-sm text-red-700">Historique momentanément indisponible.</p>}
        {!versionsError && historiqueVersions.length === 0 && <p className="mt-2 text-sm text-gray-600">Aucune version enregistrée.</p>}
        <ul className="divide-y divide-gray-200">
          {historiqueVersions.map((version) => (
            <li key={version.id} className="py-3 text-sm">
              <p className="font-medium">{version.historique ? "Rapport antérieur au suivi des versions" : new Date(version.created_at).toLocaleString("fr-CH")}</p>
              {!version.historique && <p>{version.auteur_nom ?? "Utilisateur supprimé"} — {version.motif}</p>}
              {version.historique && <p className="text-gray-500">Empreinte et auteur de génération non enregistrés à l’origine.</p>}
              {version.url ? <a className="mt-1 inline-block text-blue-700 underline" href={version.url} target="_blank" rel="noopener noreferrer">Consulter cette version</a> : <p className="text-amber-700">Fichier momentanément inaccessible.</p>}
              {version.sha256 && <details className="mt-1 text-gray-500"><summary>Empreinte du fichier (SHA-256)</summary><code className="break-all">{version.sha256}</code></details>}
            </li>
          ))}
        </ul>
        {historiqueVersions.length === 50 && <p className="text-sm text-gray-500">Les 50 versions les plus récentes sont affichées.</p>}
      </section>
      <EmailHistory entries={emailHistory} />
    </div>
  );
}
