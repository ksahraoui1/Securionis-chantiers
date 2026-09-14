"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { assertOfflineScope, OFFLINE_CHANGED_EVENT } from "@/lib/offline/scope";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { compressPhoto, validatePhoto } from "@/lib/utils/photo-compress";
import { MAX_PHOTOS } from "@/lib/utils/constants";
import { extractStoragePath } from "@/lib/utils/storage-path";
import { savePendingPhoto, deletePendingPhoto, getPendingPhotos } from "@/lib/offline/db";

interface UsePhotoUploadOptions { chantierId: string; visiteId: string; reponseId: string; pointId: string }
type Preview = { apercu: string; idLocal: string };
export function usePhotoUpload({ chantierId, visiteId, reponseId, pointId }: UsePhotoUploadOptions) {
  const scope = useOfflineScope();
  const [photos, setPhotos] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const previewRef = useRef<Record<string, Preview>>({});
  const [nbEnAttente, setNbEnAttente] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const refresh = async () => {
      try {
        const pending = await getPendingPhotos(scope, visiteId);
        if (alive.current) setNbEnAttente(pending.filter(p => Object.values(previewRef.current).some(v => v.idLocal === p.id)).length);
      } catch { /* Le bandeau global signale les erreurs de stockage. */ }
    };
    window.addEventListener(OFFLINE_CHANGED_EVENT, refresh);
    return () => {
      alive.current = false;
      window.removeEventListener(OFFLINE_CHANGED_EVENT, refresh);
      Object.values(previewRef.current).forEach(p => URL.revokeObjectURL(p.apercu));
      previewRef.current = {};
    };
  }, [scope, visiteId]);
  const addPreview = useCallback((url: string, blob: Blob, idLocal: string) => {
    if (previewRef.current[url]) return;
    previewRef.current = { ...previewRef.current, [url]: { apercu: URL.createObjectURL(blob), idLocal } };
    setPreviews(previewRef.current);
  }, []);
  const resoudreApercu = useCallback((url: string) => previews[url]?.apercu ?? url, [previews]);

  // Toujours conserver le fichier avant de l'associer à une réponse, même en ligne.
  // Le synchroniseur ne retire cette copie qu'après l'accusé de la réponse.
  const queuePhoto = useCallback(async (blob: Blob) => {
    assertOfflineScope(scope);
    const filename = `${crypto.randomUUID()}.jpg`, id = crypto.randomUUID();
    const path = `${chantierId}/${visiteId}/${reponseId}/${filename}`;
    const { data: { publicUrl: url } } = createClient().storage.from("visite-photos").getPublicUrl(path);
    await savePendingPhoto(scope, { id, visite_id: visiteId, chantier_id: chantierId, reponse_key: reponseId, blob, filename });
    assertOfflineScope(scope);
    addPreview(url, blob, id);
    setNbEnAttente(n => n + 1);
    return url;
  }, [scope, chantierId, visiteId, reponseId, addPreview]);
  const uploadPhoto = useCallback(async (file: File): Promise<string | null> => {
    setError(null);
    if (photos.length >= MAX_PHOTOS) { setError(`Maximum de ${MAX_PHOTOS} photos atteint.`); return null; }
    const invalid = validatePhoto(file);
    if (invalid) { setError(invalid); return null; }
    setUploading(true);
    try {
      const url = await queuePhoto(await compressPhoto(file));
      setPhotos(prev => [...prev, url]);
      return url;
    } catch { setError("La photo n’a pas pu être sauvegardée sur cet appareil. Réessayez."); return null; }
    finally { setUploading(false); }
  }, [photos.length, queuePhoto]);
  const removePhoto = useCallback(async (url: string) => {
    try {
      assertOfflineScope(scope);
      const preview = previewRef.current[url];
      if (preview) await deletePendingPhoto(scope, preview.idLocal);
      // Retirer la référence de la réponse ; conserver les originaux distants
      // susceptibles d'être présents dans une ancienne version de rapport.
      setPhotos(prev => prev.filter(p => p !== url));
      return true;
    } catch { setError("Impossible de retirer la photo locale."); return false; }
  }, [scope]);
  const replacePhoto = useCallback(async (oldUrl: string, blob: Blob): Promise<string | null> => {
    setUploading(true); setError(null);
    try {
      const url = await queuePhoto(blob);
      const original = previewRef.current[oldUrl];
      if (original) await deletePendingPhoto(scope, original.idLocal);
      setPhotos(prev => prev.map(p => p === oldUrl ? url : p));
      return url;
    } catch { setError("La photo annotée n’a pas pu être sauvegardée. L’original est conservé."); return null; }
    finally { setUploading(false); }
  }, [scope, queuePhoto]);
  const initPhotos = useCallback(async (existing: string[]) => {
    setPhotos(existing);
    try {
      const pending = await getPendingPhotos(scope, visiteId);
      if (!alive.current) return;
      const restored = [...existing];
      for (const photo of pending) {
        const path = `${photo.chantier_id}/${photo.visite_id}/${photo.reponse_key}/${photo.filename}`;
        const known = existing.find(url => extractStoragePath(url, "visite-photos") === path);
        if (!known && photo.reponse_key !== reponseId && photo.reponse_key !== pointId) continue;
        const url = known ?? createClient().storage.from("visite-photos").getPublicUrl(path).data.publicUrl;
        addPreview(url, photo.blob, photo.id);
        if (!restored.includes(url)) restored.push(url);
      }
      assertOfflineScope(scope);
      if (alive.current) { setReady(true); setPhotos(restored); setNbEnAttente(pending.filter(p => Object.values(previewRef.current).some(v => v.idLocal === p.id)).length); }
    } catch { if (!scope.signal.aborted) setError("Impossible de reprendre les photos locales. Rechargez la page avant de modifier ce point."); }
  }, [scope, visiteId, reponseId, pointId, addPreview]);
  return { ready, photos, resoudreApercu, nbEnAttente, uploading, error, uploadPhoto, removePhoto, replacePhoto, initPhotos, canAddMore: photos.length < MAX_PHOTOS, photoCount: photos.length };
}
