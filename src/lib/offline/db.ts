import { assertOfflineScope, OFFLINE_CHANGED_EVENT, type OfflineScope } from "@/lib/offline/scope";

const STORES = { RESPONSES: "pending_responses", VISITES: "cached_visites", PHOTOS: "pending_photos", RECOVERY: "recovery_responses", COPIES: "saved_resolutions" } as const;
const writes = new Map<string, Promise<unknown>>();
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// L'ancienne base sans propriétaire n'est ni lue, ni attribuée, ni supprimée.
export async function hasLegacyOfflineDatabase(): Promise<boolean> {
  return typeof indexedDB.databases === "function" && (await indexedDB.databases()).some(db => db.name === "securionis-offline");
}
function openDB(scope: OfflineScope): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scope.database, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.COPIES)) db.createObjectStore(STORES.COPIES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.RECOVERY)) db.createObjectStore(STORES.RECOVERY, { keyPath: "recovery_key" });
      if (db.objectStoreNames.contains(STORES.RESPONSES)) return;
      const responses = db.createObjectStore(STORES.RESPONSES, { keyPath: "key" });
      responses.createIndex("visite_id", "visite_id");
      responses.createIndex("synced", "synced");
      db.createObjectStore(STORES.VISITES, { keyPath: "visite_id" });
      const photos = db.createObjectStore(STORES.PHOTOS, { keyPath: "id" });
      photos.createIndex("visite_id", "visite_id");
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Stockage local occupé. Fermez les anciens onglets."));
  });
}
async function transaction<T>(scope: OfflineScope, stores: string | string[], mode: IDBTransactionMode, action: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await openDB(scope);
  return new Promise((resolve, reject) => {
    let value: T;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => {
      db.close();
      try {
        if (mode === "readonly") assertOfflineScope(scope);
        if (typeof window !== "undefined" && mode === "readwrite") window.dispatchEvent(new Event(OFFLINE_CHANGED_EVENT));
        resolve(value);
      } catch (error) { reject(error); }
    };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Écriture locale interrompue")); };
    try { action(tx, next => { value = next; }); } catch (error) { tx.abort(); reject(error); }
  });
}
function write<T>(scope: OfflineScope, stores: string | string[], action: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  assertOfflineScope(scope);
  // Une écriture déjà acceptée termine dans SA base même si la session change.
  // Les écritures suivantes sont refusées. L'ordre protège aussi les frappes rapides.
  const operation = (writes.get(scope.database) ?? Promise.resolve()).catch(() => {}).then(() => transaction(scope, stores, "readwrite", action));
  writes.set(scope.database, operation);
  return operation;
}
async function read<T>(scope: OfflineScope, store: string, query: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  assertOfflineScope(scope);
  await writes.get(scope.database);
  assertOfflineScope(scope);
  return transaction<T>(scope, store, "readonly", (tx, result) => { const req = query(tx.objectStore(store)); req.onsuccess = () => result(req.result); });
}
export async function flushOfflineWrites(scope: OfflineScope): Promise<void> { await writes.get(scope.database); }

export interface PendingResponse {
  key: string; revision: string; visite_id: string; point_controle_id: string;
  valeur: string; remarque: string | null; photos: string[]; updated_at: string; synced: 0 | 1;
  // undefined : ancienne saisie dont la version d'origine est inconnue ; null : absence observée.
  base_revision?: string | null; ancestors?: string[]; editor_id?: string; local_conflict?: boolean; recovery_key?: string;
}
export interface ResponseOrigin { base_revision?: string | null; local_revision?: string }
export interface ResponseEdit extends ResponseOrigin { editor_id: string }
export function savePendingResponse(scope: OfflineScope, data: Pick<PendingResponse, "visite_id" | "point_controle_id" | "valeur" | "remarque" | "photos" | "updated_at">, edit: ResponseEdit): Promise<PendingResponse> {
  const record: PendingResponse = { ...data, photos: [...data.photos], key: `${data.visite_id}:${data.point_controle_id}`, revision: crypto.randomUUID(), synced: 0, base_revision: edit.base_revision, ancestors: [], editor_id: edit.editor_id };
  return write(scope, [STORES.RESPONSES, STORES.RECOVERY], (tx, result) => {
    const store = tx.objectStore(STORES.RESPONSES); const req = store.get(record.key);
    req.onsuccess = () => {
      const previous = req.result as PendingResponse | undefined;
      if (previous && (previous.editor_id === edit.editor_id || previous.revision === edit.local_revision)) {
        record.base_revision = previous.base_revision;
        record.ancestors = previous.synced === 1 ? [] : [...(previous.ancestors ?? []), previous.revision];
      } else if (previous?.synced === 0 || edit.local_revision) {
        // Un autre formulaire a pris la main. Conserver aussi la nouvelle saisie
        // sans remplacer sa file ni lui emprunter une version qu'elle n'a pas vue.
        record.local_conflict = true;
        record.recovery_key = `${record.key}:${edit.editor_id}`;
        tx.objectStore(STORES.RECOVERY).put(record); result(record); return;
      }
      store.put(record); result(record);
    };
  });
}
export function getUnsyncedResponses(scope: OfflineScope): Promise<PendingResponse[]> { return read(scope, STORES.RESPONSES, store => store.index("synced").getAll(0)); }
export function getRecoveryResponses(scope: OfflineScope): Promise<PendingResponse[]> { return read(scope, STORES.RECOVERY, store => store.getAll()); }
export function markResponseSynced(scope: OfflineScope, key: string, revision: string, serverRevision: string): Promise<boolean> {
  return write(scope, STORES.RESPONSES, (tx, result) => {
    const store = tx.objectStore(STORES.RESPONSES);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as PendingResponse | undefined;
      if (record?.revision === revision) {
        store.put({ ...record, synced: 1, base_revision: serverRevision, ancestors: [] }); result(true);
      } else {
        const index = record?.ancestors?.indexOf(revision) ?? -1;
        if (record && index >= 0) {
          // Avancer seulement un descendant de cet envoi ; un ancien accusé
          // ne peut ni supprimer la nouvelle saisie, ni ramener sa base en arrière.
          store.put({ ...record, base_revision: serverRevision, ancestors: record.ancestors!.slice(index + 1) });
        }
        result(false);
      }
    };
  });
}
export function clearSyncedResponses(scope: OfflineScope, visiteId: string): Promise<void> {
  return write(scope, STORES.RESPONSES, tx => {
    const store = tx.objectStore(STORES.RESPONSES); const req = store.index("visite_id").getAll(visiteId);
    req.onsuccess = () => { for (const record of req.result) if (record.synced === 1) store.delete(record.key); };
  });
}
export interface CachedVisite { visite_id: string; chantier_id: string; data: unknown; cached_at: string }
export function cacheVisite(scope: OfflineScope, visite: CachedVisite): Promise<void> { return write(scope, STORES.VISITES, tx => { tx.objectStore(STORES.VISITES).put(visite); }); }
export async function getCachedVisite(scope: OfflineScope, visiteId: string): Promise<CachedVisite | undefined> {
  const visite = await read<CachedVisite | undefined>(scope, STORES.VISITES, store => store.get(visiteId));
  const age = Date.now() - Date.parse(visite?.cached_at ?? "");
  return Number.isFinite(age) && age >= 0 && age < CACHE_MAX_AGE_MS ? visite : undefined;
}
export interface PendingPhoto { id: string; visite_id: string; chantier_id: string; reponse_key: string; blob: Blob; filename: string }
export function savePendingPhoto(scope: OfflineScope, photo: PendingPhoto): Promise<void> { return write(scope, STORES.PHOTOS, tx => { tx.objectStore(STORES.PHOTOS).put(photo); }); }
export function getPendingPhotos(scope: OfflineScope, visiteId: string): Promise<PendingPhoto[]> { return read(scope, STORES.PHOTOS, store => store.index("visite_id").getAll(visiteId)); }
export function getAllPendingPhotos(scope: OfflineScope): Promise<PendingPhoto[]> { return read(scope, STORES.PHOTOS, store => store.getAll()); }
export function deletePendingPhoto(scope: OfflineScope, id: string): Promise<void> { return write(scope, STORES.PHOTOS, tx => { tx.objectStore(STORES.PHOTOS).delete(id); }); }
export interface SavedResolution {
  id: string; created_at: string; kind: "resolution" | "import" | "photos";
  responses: PendingResponse[]; photos: PendingPhoto[];
}
export interface LocalSnapshot { responses: PendingResponse[]; recovery: PendingResponse[]; photos: PendingPhoto[]; copies: SavedResolution[] }
export async function readLocalSnapshot(scope: OfflineScope): Promise<LocalSnapshot> {
  assertOfflineScope(scope); await flushOfflineWrites(scope); assertOfflineScope(scope);
  return transaction(scope, Object.values(STORES).filter(s => s !== STORES.VISITES), "readonly", (tx, result) => {
    const snapshot: LocalSnapshot = { responses: [], recovery: [], photos: [], copies: [] };
    for (const [field, store] of [["responses", STORES.RESPONSES], ["recovery", STORES.RECOVERY], ["photos", STORES.PHOTOS], ["copies", STORES.COPIES]] as const) {
      const req = tx.objectStore(store).getAll(); req.onsuccess = () => { snapshot[field] = req.result; };
    }
    result(snapshot);
  });
}
export async function readOfflineBackup(scope: OfflineScope) {
  const snapshot = await readLocalSnapshot(scope);
  return { format: "securionis-offline-backup-v2", user_id: scope.userId, entreprise_id: scope.entrepriseId,
    exported_at: new Date().toISOString(), ...snapshot, responses: snapshot.responses.filter(r => r.synced === 0) };
}
export async function getPendingCount(scope: OfflineScope): Promise<number> {
  const [responses, photos, recovery] = await Promise.all([getUnsyncedResponses(scope), getAllPendingPhotos(scope), getRecoveryResponses(scope)]);
  return responses.length + photos.length + recovery.length;
}
/** Effacer les lectures conservées, jamais les réponses ou photos non envoyées. */
export function purgeReadCache(scope: OfflineScope): Promise<void> {
  return write(scope, [STORES.VISITES, STORES.RESPONSES], tx => {
    tx.objectStore(STORES.VISITES).clear();
    const store = tx.objectStore(STORES.RESPONSES); const req = store.getAll();
    req.onsuccess = () => { for (const record of req.result) if (record.synced === 1) store.delete(record.key); };
  });
}

/** Signature du contenu observé : un reçu ou une autre saisie invalide le choix. */
export function responseSnapshotToken(records: PendingResponse[]): string {
  return JSON.stringify([...records].sort((a, b) => (a.recovery_key ?? a.key).localeCompare(b.recovery_key ?? b.key)));
}
export function pendingPhotoPath(photo: PendingPhoto): string {
  return `${photo.chantier_id}/${photo.visite_id}/${photo.reponse_key}/${photo.filename}`;
}
function photoReferenced(photo: PendingPhoto, records: PendingResponse[]): boolean {
  const path = pendingPhotoPath(photo);
  return records.some(r => r.photos.some(url => url === path || url.split("?")[0].endsWith(`/visite-photos/${path}`)));
}
export function draftsForKey(snapshot: LocalSnapshot, key: string): PendingResponse[] {
  return [...snapshot.responses, ...snapshot.recovery].filter(r => r.key === key);
}
/** Remplace seulement l'ensemble de brouillons effectivement comparé.
 * La copie et les octets sont enregistrés dans la même transaction que le choix.
 */
export async function stageResponseResolution(scope: OfflineScope, key: string, token: string,
  next: PendingResponse | null): Promise<void> {
  const accepted = await write<boolean>(scope, [STORES.RESPONSES, STORES.RECOVERY, STORES.PHOTOS, STORES.COPIES], (tx, result) => {
    const main = tx.objectStore(STORES.RESPONSES).getAll();
    const recoveries = tx.objectStore(STORES.RECOVERY).getAll();
    const photos = tx.objectStore(STORES.PHOTOS).getAll();
    let complete = 0;
    const ready = () => {
      if (++complete !== 3) return;
      const all = [...main.result, ...recoveries.result] as PendingResponse[];
      const previous = all.filter(r => r.key === key);
      if (responseSnapshotToken(previous) !== token) { result(false); return; }
      const savedPhotos = (photos.result as PendingPhoto[]).filter(p => photoReferenced(p, previous));
      tx.objectStore(STORES.COPIES).add({ id: crypto.randomUUID(), kind: "resolution", created_at: new Date().toISOString(), responses: previous, photos: savedPhotos } satisfies SavedResolution);
      for (const r of previous) if (r.recovery_key) tx.objectStore(STORES.RECOVERY).delete(r.recovery_key);
      if (next) tx.objectStore(STORES.RESPONSES).put(next);
      else tx.objectStore(STORES.RESPONSES).delete(key);
      const remaining = [...all.filter(r => r.key !== key && r.synced === 0), ...(next?.synced === 0 ? [next] : [])];
      for (const photo of savedPhotos) if (!photoReferenced(photo, remaining)) tx.objectStore(STORES.PHOTOS).delete(photo.id);
      result(true);
    };
    main.onsuccess = recoveries.onsuccess = photos.onsuccess = ready;
  });
  if (!accepted) throw new Error("Une saisie locale a changé. Rechargez la comparaison avant de choisir.");
}
/** Une photo sans réponse active reste récupérable, sans bloquer la clôture. */
export async function archiveUnusedPhotos(scope: OfflineScope, ids: string[]): Promise<number> {
  return write(scope, [STORES.RESPONSES, STORES.RECOVERY, STORES.PHOTOS, STORES.COPIES], (tx, result) => {
    const main = tx.objectStore(STORES.RESPONSES).getAll(), recoveries = tx.objectStore(STORES.RECOVERY).getAll(), photos = tx.objectStore(STORES.PHOTOS).getAll();
    let complete = 0;
    const ready = () => {
      if (++complete !== 3) return;
      const records = [...main.result, ...recoveries.result] as PendingResponse[];
      const saved = (photos.result as PendingPhoto[]).filter(p => ids.includes(p.id) && !photoReferenced(p, records.filter(r => r.synced === 0)));
      if (saved.length) {
        tx.objectStore(STORES.COPIES).add({ id: crypto.randomUUID(), kind: "photos", created_at: new Date().toISOString(), responses: [], photos: saved } satisfies SavedResolution);
        for (const p of saved) tx.objectStore(STORES.PHOTOS).delete(p.id);
      }
      result(saved.length);
    };
    main.onsuccess = recoveries.onsuccess = photos.onsuccess = ready;
  });
}
/** Import en récupération seulement : jamais d'écrasement de la file courante. */
export function storeImportedDrafts(scope: OfflineScope, id: string, responses: PendingResponse[], photos: PendingPhoto[], copies: SavedResolution[] = []): Promise<boolean> {
  return write(scope, [STORES.RECOVERY, STORES.PHOTOS, STORES.COPIES], (tx, result) => {
    const exists = tx.objectStore(STORES.COPIES).get(id);
    exists.onsuccess = () => {
      if (exists.result) { result(false); return; }
      tx.objectStore(STORES.COPIES).add({ id, kind: "import", created_at: new Date().toISOString(), responses, photos } satisfies SavedResolution);
      for (const copy of copies) tx.objectStore(STORES.COPIES).add(copy);
      for (const response of responses) tx.objectStore(STORES.RECOVERY).add(response);
      for (const photo of photos) tx.objectStore(STORES.PHOTOS).add(photo);
      result(true);
    };
  });
}
