import { assertOfflineScope, OFFLINE_CHANGED_EVENT, type OfflineScope } from "@/lib/offline/scope";

const STORES = { RESPONSES: "pending_responses", VISITES: "cached_visites", PHOTOS: "pending_photos" } as const;
const writes = new Map<string, Promise<unknown>>();
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// L'ancienne base sans propriétaire n'est ni lue, ni attribuée, ni supprimée.
export async function hasLegacyOfflineDatabase(): Promise<boolean> {
  return typeof indexedDB.databases === "function" && (await indexedDB.databases()).some(db => db.name === "securionis-offline");
}
function openDB(scope: OfflineScope): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scope.database, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
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
}
export function savePendingResponse(scope: OfflineScope, data: Omit<PendingResponse, "key" | "synced" | "revision">): Promise<PendingResponse> {
  const record: PendingResponse = { ...data, photos: [...data.photos], key: `${data.visite_id}:${data.point_controle_id}`, revision: crypto.randomUUID(), synced: 0 };
  return write(scope, STORES.RESPONSES, (tx, result) => { tx.objectStore(STORES.RESPONSES).put(record); result(record); });
}
export function getUnsyncedResponses(scope: OfflineScope): Promise<PendingResponse[]> { return read(scope, STORES.RESPONSES, store => store.index("synced").getAll(0)); }
export function markResponseSynced(scope: OfflineScope, key: string, revision: string): Promise<boolean> {
  return write(scope, STORES.RESPONSES, (tx, result) => {
    const store = tx.objectStore(STORES.RESPONSES);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as PendingResponse | undefined;
      if (record?.revision === revision) { store.delete(key); result(true); } else result(false);
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
export async function getPendingCount(scope: OfflineScope): Promise<number> {
  const [responses, photos] = await Promise.all([getUnsyncedResponses(scope), getAllPendingPhotos(scope)]);
  return responses.length + photos.length;
}
/** Effacer les lectures conservées, jamais les réponses ou photos non envoyées. */
export function purgeReadCache(scope: OfflineScope): Promise<void> {
  return write(scope, [STORES.VISITES, STORES.RESPONSES], tx => {
    tx.objectStore(STORES.VISITES).clear();
    const store = tx.objectStore(STORES.RESPONSES); const req = store.getAll();
    req.onsuccess = () => { for (const record of req.result) if (record.synced === 1) store.delete(record.key); };
  });
}
