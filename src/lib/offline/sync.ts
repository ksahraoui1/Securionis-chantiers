"use client";

// Synchronisation des données offline → Supabase
// Appelé quand le réseau revient ou manuellement.

import { createClient } from "@/lib/supabase/client";
import {
  getUnsyncedResponses,
  markResponseSynced,
  getPendingPhotos,
  deletePendingPhoto,
} from "./db";

export async function syncPendingData(): Promise<{
  syncedResponses: number;
  syncedPhotos: number;
  errors: number;
}> {
  const supabase = createClient();
  let syncedResponses = 0;
  let syncedPhotos = 0;
  let errors = 0;

  // 1. Sync pending photos first (responses may reference uploaded URLs)
  // Collect all visite IDs from pending responses to find their photos
  const pendingResponses = await getUnsyncedResponses();
  const visiteIds = [...new Set(pendingResponses.map((r) => r.visite_id))];

  for (const visiteId of visiteIds) {
    const photos = await getPendingPhotos(visiteId);
    for (const photo of photos) {
      try {
        const path = `${photo.chantier_id}/${photo.visite_id}/${photo.reponse_key}/${photo.filename}`;
        const { error } = await supabase.storage
          .from("visite-photos")
          .upload(path, photo.blob, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (error && !error.message.includes("already exists")) {
          errors++;
          continue;
        }

        await deletePendingPhoto(photo.id);
        syncedPhotos++;
      } catch {
        errors++;
      }
    }
  }

  // 2. Sync pending responses
  for (const response of pendingResponses) {
    try {
      const { error } = await supabase.from("reponses").upsert(
        {
          visite_id: response.visite_id,
          point_controle_id: response.point_controle_id,
          valeur: response.valeur,
          remarque: response.remarque,
          photos: response.photos,
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

  return { syncedResponses, syncedPhotos, errors };
}
