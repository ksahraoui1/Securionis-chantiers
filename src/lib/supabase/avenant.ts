import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Avenant, DemandeAvenant, PlanAvenant } from "@/lib/visites/avenant";
import { cheminRapportVisite, cheminStockageValide } from "@/lib/utils/storage-reference";
export class AvenantError extends Error {
  constructor(message: string, public status: number, public refusConfirme = false) { super(message); }
}
function erreurRpc(error: { code?: string } | null): never {
  const code = error?.code;
  const confirmed = ["40001", "42501", "22023", "23505"].includes(code ?? "");
  throw new AvenantError(code === "40001" ? "Le rapport ou l’historique des avenants a changé. Relisez-le avant de valider." : code === "42501" ? "Votre affectation ou votre accès ne permet plus de valider cet avenant." : code === "22023" ? "Avenant invalide ou préparation expirée. Reprenez sa validation." : "Publication non confirmée. Réessayez la même demande.", code === "40001" ? 409 : code === "42501" ? 403 : code === "22023" ? 422 : 503, confirmed);
}
export async function creerAvenant(client: SupabaseClient, service: SupabaseClient, demande: DemandeAvenant, chantierId: string) {
  const result = await client.rpc("preparer_avenant_visite", {
    p_visite_id: demande.visiteId, p_id: demande.id, p_archive_id: demande.archiveId,
    p_rapport_reference: demande.rapportReference, p_precedent_id: demande.precedentId,
    p_objet: demande.objet, p_motif: demande.motif, p_contenu: demande.contenu,
  });
  if (result.error || !result.data) erreurRpc(result.error);
  if (result.data.existant?.id === demande.id) return { id: demande.id, numero: result.data.existant.numero as number, dejaPublie: true };
  const plan = result.data as PlanAvenant;
  if (plan.id !== demande.id || plan.auteur_id !== demande.auteurId || plan.visite_id !== demande.visiteId || !Number.isInteger(plan.numero)) throw new AvenantError("Préparation de l’avenant incohérente.", 503);
  const quota = await service.rpc("consommer_quota", { p_cle: `avenant:${demande.auteurId}`, p_max: 10, p_fenetre_s: 3600 });
  if (quota.error || typeof quota.data !== "boolean") throw new AvenantError("Vérification du quota indisponible.", 503);
  if (!quota.data) throw new AvenantError("Limite de dix avenants par heure atteinte.", 429, true);
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { AvenantVisite } = await import("@/components/pdf/avenant-visite");
  const pdf = await renderToBuffer(AvenantVisite({ plan }));
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const chemin = cheminRapportVisite(chantierId, demande.visiteId).replace(/rapport\.pdf$/, `avenants/${demande.id}/${sha256}.pdf`);
  const { error } = await service.storage.from("rapports").upload(chemin, pdf, { contentType: "application/pdf", upsert: false });
  if (error) throw new AvenantError("Enregistrement non confirmé. Réessayez la même demande.", 503);
  const publication = await service.rpc("publier_avenant_visite", { p_plan: plan, p_sha256: sha256 });
  // Aucun effacement automatique : la publication peut avoir réussi malgré une réponse perdue.
  if (publication.error || publication.data !== demande.id) erreurRpc(publication.error);
  return { id: demande.id, numero: plan.numero, dejaPublie: false };
}
export async function chargerPdfAvenant(client: SupabaseClient, avenant: Avenant, chantierId: string) {
  const prefixe = cheminRapportVisite(chantierId, avenant.visite_id).replace(/rapport\.pdf$/, `avenants/${avenant.id}/`);
  if (!cheminStockageValide(avenant.storage_path) || avenant.storage_path !== `${prefixe}${avenant.sha256}.pdf` || !/^[0-9a-f]{64}$/.test(avenant.sha256)) throw new AvenantError("Référence d’avenant invalide.", 503);
  const opts = { signal: AbortSignal.timeout(30_000), redirect: "error" as const };
  const { data, error } = await client.storage.from("rapports").download(avenant.storage_path, {}, opts).asStream();
  if (error || !data) throw new AvenantError("PDF d’avenant inaccessible.", 503);
  const reader = data.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > 10 * 1024 * 1024) throw new AvenantError("PDF d’avenant trop volumineux.", 422); chunks.push(value); }
  } finally { try { await reader.cancel(); } catch { /* fermé */ } reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== avenant.sha256 || bytes.subarray(0,5).toString() !== "%PDF-") throw new AvenantError("L’intégrité du PDF d’avenant ne peut pas être confirmée.", 503);
  return bytes;
}
export async function lireAvenants(client: SupabaseClient, visiteId: string): Promise<Avenant[]> {
  const { data, error } = await client.from("visite_avenants").select("*").eq("visite_id", visiteId).order("numero", { ascending: true });
  if (error || !data) throw new AvenantError("Historique des avenants indisponible.", 503);
  return data as Avenant[];
}
