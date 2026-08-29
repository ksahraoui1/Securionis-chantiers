"use client";

// Synchronisation des données offline → Supabase
// Appelé quand le réseau revient ou manuellement.

import { createClient } from "@/lib/supabase/client";
import { canoniserUrlsStockage } from "@/lib/utils/url-signee";
import {
  getUnsyncedResponses,
  markResponseSynced,
  getPendingPhotos,
  deletePendingPhoto,
} from "./db";

export type SyncResult = {
  syncedResponses: number;
  syncedPhotos: number;
  conflicts: number;
  errors: number;
  discarded: number;
};

export async function syncPendingData(): Promise<SyncResult> {
  const supabase = createClient();
  let syncedResponses = 0;
  let syncedPhotos = 0;
  let conflicts = 0;
  let errors = 0;
  let discarded = 0;

  // 1. Sync pending photos first (responses may reference uploaded URLs)
  const pendingResponses = await getUnsyncedResponses();
  const visiteIds = [...new Set(pendingResponses.map((r) => r.visite_id))];

  // Déterminer quelles visites existent encore côté serveur.
  // Une modif en attente dont la visite a été supprimée ne pourra jamais
  // être synchronisée (violation de clé étrangère) — il faut l'écarter
  // pour ne pas bloquer indéfiniment le compteur « X modification en attente ».
  const existingVisiteIds = new Set<string>();
  if (visiteIds.length > 0) {
    const { data: existingVisites } = await supabase
      .from("visites")
      .select("id")
      .in("id", visiteIds);
    for (const v of existingVisites ?? []) existingVisiteIds.add(v.id as string);
  }

  for (const visiteId of visiteIds) {
    const photos = await getPendingPhotos(visiteId);
    for (const photo of photos) {
      // Visite supprimée → photo orpheline : écarter sans erreur
      if (!existingVisiteIds.has(visiteId)) {
        await deletePendingPhoto(photo.id);
        discarded++;
        continue;
      }
      try {
        const path = `${photo.chantier_id}/${photo.visite_id}/${photo.reponse_key}/${photo.filename}`;
        const { error } = await supabase.storage
          .from("visite-photos")
          .upload(path, photo.blob, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (error) {
          if (error.message.includes("already exists")) {
            // Photo déjà présente sur le serveur — supprimer du pending sans erreur
            await deletePendingPhoto(photo.id);
            syncedPhotos++;
          } else {
            errors++;
          }
          continue;
        }

        await deletePendingPhoto(photo.id);
        syncedPhotos++;
      } catch {
        errors++;
      }
    }
  }

  // 2. Sync pending responses avec détection de conflits
  // Pré-charger en une seule requête les timestamps serveur des réponses concernées
  // (évite un SELECT par réponse — problème N+1).
  const serverUpdatedAt = new Map<string, string>();
  if (visiteIds.length > 0) {
    const { data: serverRecords } = await supabase
      .from("reponses")
      .select("visite_id, point_controle_id, updated_at")
      .in("visite_id", visiteIds);

    for (const rec of serverRecords ?? []) {
      serverUpdatedAt.set(`${rec.visite_id}:${rec.point_controle_id}`, rec.updated_at);
    }
  }

  for (const response of pendingResponses) {
    // Visite supprimée → réponse orpheline : écarter (impossible à synchroniser)
    if (!existingVisiteIds.has(response.visite_id)) {
      await markResponseSynced(response.key);
      discarded++;
      continue;
    }
    try {
      // Vérifier si une version plus récente existe déjà sur le serveur
      const serverTimestamp = serverUpdatedAt.get(
        `${response.visite_id}:${response.point_controle_id}`
      );

      if (serverTimestamp) {
        const serverTime = new Date(serverTimestamp).getTime();
        const localTime = new Date(response.updated_at).getTime();

        if (serverTime > localTime) {
          // Conflit : le serveur est plus récent — ne pas écraser
          // Marquer comme synchronisé pour nettoyer le pending (la version serveur prime)
          await markResponseSynced(response.key);
          conflicts++;
          continue;
        }
      }

      const { error } = await supabase.from("reponses").upsert(
        {
          visite_id: response.visite_id,
          point_controle_id: response.point_controle_id,
          valeur: response.valeur,
          remarque: response.remarque,
          photos: canoniserUrlsStockage(response.photos),
          updated_at: response.updated_at,
        },
        { onConflict: "visite_id,point_controle_id" }
      );

      if (error) {
        errors++;
        continue;
      }

      await markResponseSynced(response.key);
      syncedResponses++;
    } catch {
      errors++;
    }
  }

  return { syncedResponses, syncedPhotos, conflicts, errors, discarded };
}
