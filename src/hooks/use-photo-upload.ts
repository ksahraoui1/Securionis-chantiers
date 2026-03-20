"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressPhoto, validatePhoto } from "@/lib/utils/photo-compress";
import { MAX_PHOTOS } from "@/lib/utils/constants";

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

        const {
          data: { publicUrl },
        } = supabase.storage.from("visite-photos").getPublicUrl(path);

        setPhotos((prev) => [...prev, publicUrl]);
        return publicUrl;
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
      const path = url.split("/visite-photos/")[1];
      if (path) {
        const supabase = createClient();
        await supabase.storage.from("visite-photos").remove([path]);
      }
      setPhotos((prev) => prev.filter((p) => p !== url));
    },
    []
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
    initPhotos,
    canAddMore: photos.length < MAX_PHOTOS,
    photoCount: photos.length,
  };
}
