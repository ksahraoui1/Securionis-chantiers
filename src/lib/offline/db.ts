// IndexedDB store pour le mode hors-ligne.
// Stocke les réponses en attente de sync et les fiches déjà consultées.

const DB_NAME = "securionis-offline";
const DB_VERSION = 1;

const STORES = {
  PENDING_RESPONSES: "pending_responses",
  CACHED_VISITES: "cached_visites",
  PENDING_PHOTOS: "pending_photos",
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Réponses en attente de synchronisation
      if (!db.objectStoreNames.contains(STORES.PENDING_RESPONSES)) {
        const store = db.createObjectStore(STORES.PENDING_RESPONSES, {
          keyPath: "key",
        });
        store.createIndex("visite_id", "visite_id", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
      }

      // Fiches de visite mises en cache pour lecture offline
      if (!db.objectStoreNames.contains(STORES.CACHED_VISITES)) {
        db.createObjectStore(STORES.CACHED_VISITES, { keyPath: "visite_id" });
      }

      // Photos en attente d'upload
      if (!db.objectStoreNames.contains(STORES.PENDING_PHOTOS)) {
        const photoStore = db.createObjectStore(STORES.PENDING_PHOTOS, {
          keyPath: "id",
        });
        photoStore.createIndex("visite_id", "visite_id", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Réponses en attente ---

export interface PendingResponse {
  key: string; // visite_id + point_controle_id
  visite_id: string;
  point_controle_id: string;
  valeur: string;
  remarque: string | null;
  photos: string[];
  updated_at: string;
  synced: 0 | 1;
}

export async function savePendingResponse(
  data: Omit<PendingResponse, "key" | "synced">
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_RESPONSES, "readwrite");
  const store = tx.objectStore(STORES.PENDING_RESPONSES);

  const record: PendingResponse = {
    ...data,
    key: `${data.visite_id}:${data.point_controle_id}`,
    synced: 0,
  };

  store.put(record);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUnsyncedResponses(): Promise<PendingResponse[]> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_RESPONSES, "readonly");
  const store = tx.objectStore(STORES.PENDING_RESPONSES);
  const index = store.index("synced");
  const request = index.getAll(0);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markResponseSynced(key: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_RESPONSES, "readwrite");
  const store = tx.objectStore(STORES.PENDING_RESPONSES);
  const request = store.get(key);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const record = request.result;
      if (record) {
        record.synced = 1;
        store.put(record);
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncedResponses(visiteId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_RESPONSES, "readwrite");
  const store = tx.objectStore(STORES.PENDING_RESPONSES);
  const index = store.index("visite_id");
  const request = index.getAll(visiteId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      for (const record of request.result) {
        if (record.synced === 1) {
          store.delete(record.key);
        }
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// --- Cache de visites (lecture offline) ---

export interface CachedVisite {
  visite_id: string;
  chantier_id: string;
  data: unknown; // la fiche complète (points de contrôle, réponses, etc.)
  cached_at: string;
}

export async function cacheVisite(visite: CachedVisite): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.CACHED_VISITES, "readwrite");
  tx.objectStore(STORES.CACHED_VISITES).put(visite);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedVisite(
  visiteId: string
): Promise<CachedVisite | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORES.CACHED_VISITES, "readonly");
  const request = tx.objectStore(STORES.CACHED_VISITES).get(visiteId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

// --- Photos en attente d'upload ---

export interface PendingPhoto {
  id: string; // UUID
  visite_id: string;
  chantier_id: string;
  reponse_key: string; // visite_id:point_controle_id
  blob: Blob;
  filename: string;
}

export async function savePendingPhoto(photo: PendingPhoto): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_PHOTOS, "readwrite");
  tx.objectStore(STORES.PENDING_PHOTOS).put(photo);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingPhotos(
  visiteId: string
): Promise<PendingPhoto[]> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_PHOTOS, "readonly");
  const index = tx.objectStore(STORES.PENDING_PHOTOS).index("visite_id");
  const request = index.getAll(visiteId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePendingPhoto(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.PENDING_PHOTOS, "readwrite");
  tx.objectStore(STORES.PENDING_PHOTOS).delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Compteur de pending ---

export async function getPendingCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(
    [STORES.PENDING_RESPONSES, STORES.PENDING_PHOTOS],
    "readonly"
  );

  const respIndex = tx
    .objectStore(STORES.PENDING_RESPONSES)
    .index("synced");
  const respRequest = respIndex.count(0);

  const photoRequest = tx.objectStore(STORES.PENDING_PHOTOS).count();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () =>
      resolve(respRequest.result + photoRequest.result);
    tx.onerror = () => reject(tx.error);
  });
}
