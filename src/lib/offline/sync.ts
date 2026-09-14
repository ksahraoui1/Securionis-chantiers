"use client";
import { createOfflineClient } from "@/lib/offline/client";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { canoniserUrlsStockage } from "@/lib/utils/url-signee";
import { cheminStockageValide, referenceStockage } from "@/lib/utils/storage-reference";
import { getUnsyncedResponses, getRecoveryResponses, markResponseSynced, getAllPendingPhotos, deletePendingPhoto, type PendingPhoto } from "@/lib/offline/db";

export type SyncResult = { syncedResponses: number; syncedPhotos: number; conflicts: number; errors: number; discarded: number };
const running = new WeakMap<OfflineScope, Promise<SyncResult>>();
/** Sérialiser les appels de l'onglet sans perdre une saisie arrivée pendant un envoi. */
export function syncPendingData(scope: OfflineScope): Promise<SyncResult> {
  assertOfflineScope(scope);
  const operation = (running.get(scope) ?? Promise.resolve()).catch(() => {}).then(() => synchronize(scope));
  running.set(scope, operation);
  return operation;
}
function photoPath(photo: PendingPhoto): string {
  const path = `${photo.chantier_id}/${photo.visite_id}/${photo.reponse_key}/${photo.filename}`;
  if (!cheminStockageValide(path)) throw new Error("Chemin de photo locale invalide");
  return path;
}
async function synchronize(scope: OfflineScope): Promise<SyncResult> {
  assertOfflineScope(scope);
  const result: SyncResult = { syncedResponses: 0, syncedPhotos: 0, conflicts: 0, errors: 0, discarded: 0 };
  const [responses, photos, recovery] = await Promise.all([getUnsyncedResponses(scope), getAllPendingPhotos(scope), getRecoveryResponses(scope)]);
  result.conflicts = recovery.length;
  if (!responses.length && !photos.length) return result;
  const supabase = await createOfflineClient(scope);
  const visiteIds = [...new Set([...responses.map(r => r.visite_id), ...photos.map(p => p.visite_id)])];
  const [visites, records] = await Promise.all([
    supabase.from("visites").select("id, statut").in("id", visiteIds),
    supabase.from("reponses").select("id, visite_id, point_controle_id, updated_at, photos, sync_revision, sync_operation_id, sync_acteur").in("visite_id", visiteIds),
  ]);
  if (visites.error || !visites.data || records.error || !records.data) return { ...result, errors: responses.length + photos.length };
  const writable = new Set(visites.data.filter(v => v.statut !== "terminee").map(v => v.id));
  const server = new Map(records.data.map(r => [`${r.visite_id}:${r.point_controle_id}`, r]));
  const processedPhotos = new Set<string>();
  const retainedPhotos = new Set(photos.filter(photo => recovery.some(r => r.photos.some(url => referenceStockage(url)?.chemin === photoPath(photo)))).map(p => p.id));
  const upload = async (photo: PendingPhoto): Promise<void> => {
    assertOfflineScope(scope);
    const path = photoPath(photo);
    const { error } = await supabase.storage.from("visite-photos").upload(path, photo.blob, { contentType: photo.blob.type || "image/jpeg", upsert: false });
    if (!error) return;
    // Après une réponse réseau perdue, le fichier peut déjà exister. Son nom
    // seul n'est pas une preuve : comparer les octets avant de retirer la copie locale.
    if (String(error.statusCode) !== "409" && !error.message.includes("already exists")) throw error;
    const { data, error: downloadError } = await supabase.storage.from("visite-photos").download(path);
    if (downloadError || !data || data.size !== photo.blob.size) throw new Error("Photo distante différente");
    const [remote, local] = await Promise.all([data.arrayBuffer(), photo.blob.arrayBuffer()]);
    const a = new Uint8Array(remote), b = new Uint8Array(local);
    if (!a.every((byte, index) => byte === b[index])) throw new Error("Photo distante différente");
  };
  for (const response of responses) {
    assertOfflineScope(scope);
    const related = photos.filter(photo => photo.visite_id === response.visite_id && response.photos.some(url => referenceStockage(url)?.chemin === photoPath(photo)));
    related.forEach(photo => processedPhotos.add(photo.id));
    if (!writable.has(response.visite_id)) { result.errors++; continue; }
    const remote = server.get(response.key);
    const retry = typeof remote?.sync_operation_id === "string" && remote.sync_operation_id === response.revision && remote?.sync_acteur === scope.userId;
    // La base vient des valeurs affichées, jamais de l'horloge ni d'une lecture
    // opportuniste. Seul un envoi ancêtre de cette saisie peut faire avancer la base.
    if (response.base_revision === undefined) { result.conflicts++; continue; }
    const ancestorApplied = remote?.sync_acteur === scope.userId && response.ancestors?.includes(remote?.sync_operation_id ?? "");
    const expected = ancestorApplied ? remote!.sync_revision : response.base_revision;
    if (!retry && (remote?.sync_revision ?? null) !== expected) { result.conflicts++; continue; }
    try {
      for (const photo of related) await upload(photo);
      assertOfflineScope(scope);
      const { data, error } = await supabase.rpc("synchroniser_reponse_v2", {
        p_visite_id: response.visite_id, p_point_controle_id: response.point_controle_id,
        p_revision_attendue: expected, p_operation_id: response.revision,
        p_valeur: response.valeur, p_remarque: response.remarque, p_photos: canoniserUrlsStockage(response.photos),
      });
      if (error?.code === "40001") { result.conflicts++; continue; }
      if (error || !data || typeof data.id !== "string" || typeof data.revision !== "string" || data.operation_id !== response.revision) { result.errors++; continue; }
      assertOfflineScope(scope);
      const acknowledged = await markResponseSynced(scope, response.key, response.revision, data.revision);
      if (acknowledged) {
        result.syncedResponses++;
        for (const photo of related.filter(p => !retainedPhotos.has(p.id))) { await deletePendingPhoto(scope, photo.id); result.syncedPhotos++; }
      }
    } catch { result.errors++; }
  }
  // Une photo seule ne disparaît que si une réponse serveur la référence déjà.
  for (const photo of photos.filter(p => !processedPhotos.has(p.id) && !retainedPhotos.has(p.id))) {
    assertOfflineScope(scope);
    const referenced = records.data.some(r => r.visite_id === photo.visite_id && (r.photos ?? []).some((url: string) => referenceStockage(url)?.chemin === photoPath(photo)));
    if (!writable.has(photo.visite_id) || !referenced) { result.errors++; continue; }
    try { await upload(photo); await deletePendingPhoto(scope, photo.id); result.syncedPhotos++; } catch { result.errors++; }
  }
  return result;
}
