"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressPhoto, validatePhoto } from "@/lib/utils/photo-compress";
import { MAX_PHOTOS } from "@/lib/utils/constants";
import { extractStoragePath } from "@/lib/utils/storage-path";
import { signerUrl } from "@/lib/utils/url-signee";

interface UsePhotoUploadOptions {
  chantierId: string;
  visiteId: string;
  reponseId: string;
}

export function usePhotoUpload({
  chantierId,
  visiteId,
  reponseId,
}: UsePhotoUploadOptions) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      setError(null);

      if (photos.length >= MAX_PHOTOS) {
        setError(`Maximum de ${MAX_PHOTOS} photos atteint.`);
        return null;
      }

      const validationError = validatePhoto(file);
      if (validationError) {
        setError(validationError);
        return null;
      }

      setUploading(true);
      try {
        const compressed = await compressPhoto(file);
        const filename = `${crypto.randomUUID()}.jpg`;
        const path = `${chantierId}/${visiteId}/${reponseId}/${filename}`;

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("visite-photos")
          .upload(path, compressed, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          setError("Erreur lors de l'upload de la photo.");
          return null;
        }

        // Le bucket est privé (SEC-03) : sans signature, la photo qu'on vient
        // de prendre ne s'afficherait pas. L'état porte donc l'URL signée ;
        // elle est ramenée à sa forme canonique à l'enregistrement
        // (`canoniserUrlsStockage`, cf. url-signee.ts).
        const {
          data: { publicUrl },
        } = supabase.storage.from("visite-photos").getPublicUrl(path);
        const url = (await signerUrl(supabase, publicUrl)) ?? publicUrl;

        setPhotos((prev) => [...prev, url]);
        return url;
      } catch {
        setError("Erreur lors de la compression de la photo.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [photos.length, chantierId, visiteId, reponseId]
  );

  const removePhoto = useCallback(
    async (url: string) => {
      const path = extractStoragePath(url, "visite-photos");
      if (path) {
        const supabase = createClient();
        await supabase.storage.from("visite-photos").remove([path]);
      }
      setPhotos((prev) => prev.filter((p) => p !== url));
    },
    []
  );

  const replacePhoto = useCallback(
    async (oldUrl: string, blob: Blob): Promise<string | null> => {
      setError(null);
      setUploading(true);
      try {
        // Remove old file from storage
        const oldPath = extractStoragePath(oldUrl, "visite-photos");
        const supabase = createClient();
        if (oldPath) {
          await supabase.storage.from("visite-photos").remove([oldPath]);
        }

        // Upload annotated version
        const filename = `annotated-${crypto.randomUUID()}.jpg`;
        const path = `${chantierId}/${visiteId}/${reponseId}/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from("visite-photos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });

        if (uploadError) {
          setError("Erreur lors de l'upload de la photo annotée.");
          return null;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("visite-photos").getPublicUrl(path);
        const url = (await signerUrl(supabase, publicUrl)) ?? publicUrl;

        setPhotos((prev) => prev.map((p) => (p === oldUrl ? url : p)));
        return url;
      } catch {
        setError("Erreur lors du remplacement de la photo.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [chantierId, visiteId, reponseId]
  );

  const initPhotos = useCallback((existingPhotos: string[]) => {
    setPhotos(existingPhotos);
  }, []);

  return {
    photos,
    uploading,
    error,
    uploadPhoto,
    removePhoto,
    replacePhoto,
    initPhotos,
    canAddMore: photos.length < MAX_PHOTOS,
    photoCount: photos.length,
  };
}
