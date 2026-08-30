"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressPhoto, validatePhoto } from "@/lib/utils/photo-compress";
import { MAX_PHOTOS } from "@/lib/utils/constants";
import { extractStoragePath } from "@/lib/utils/storage-path";
import { signerUrl } from "@/lib/utils/url-signee";
import { savePendingPhoto, deletePendingPhoto } from "@/lib/offline/db";

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

  /**
   * Photos prises hors ligne, en attente d'envoi.
   *
   * L'état `photos` porte les URL **canoniques** — celles qui partiront en base
   * et que la photo aura une fois montée. Tant qu'elle ne l'est pas, cette URL
   * ne résout rien : l'aperçu passe donc par une `blob:` locale, gardée ici et
   * jamais écrite en base.
   */
  const [enAttente, setEnAttente] = useState<
    Record<string, { apercu: string; idLocal: string }>
  >({});
  const enAttenteRef = useRef(enAttente);
  useEffect(() => {
    enAttenteRef.current = enAttente;
  }, [enAttente]);

  // Les `blob:` occupent la mémoire du navigateur jusqu'à révocation explicite.
  useEffect(() => {
    const courant = enAttenteRef;
    return () => {
      Object.values(courant.current).forEach((p) => URL.revokeObjectURL(p.apercu));
    };
  }, []);

  /**
   * URL à afficher pour une photo : l'aperçu local si elle est en attente,
   * l'URL enregistrée sinon.
   */
  const resoudreApercu = useCallback(
    (url: string) => enAttente[url]?.apercu ?? url,
    [enAttente]
  );

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
        const {
          data: { publicUrl: urlCanonique },
        } = supabase.storage.from("visite-photos").getPublicUrl(path);

        /**
         * Repli hors ligne.
         *
         * Le chemin est déterministe et connu **avant** l'envoi : la
         * synchronisation le reconstruit à l'identique
         * (`<chantier>/<visite>/<réponse>/<fichier>`, cf. `offline/sync.ts`).
         * On peut donc enregistrer dès maintenant l'URL définitive dans la
         * réponse — elle deviendra valide au retour du réseau — et garder le
         * fichier dans IndexedDB en attendant.
         */
        const mettreEnAttente = async () => {
          const idLocal = crypto.randomUUID();
          await savePendingPhoto({
            id: idLocal,
            visite_id: visiteId,
            chantier_id: chantierId,
            reponse_key: reponseId,
            blob: compressed,
            filename,
          });
          const apercu = URL.createObjectURL(compressed);
          setEnAttente((prev) => ({ ...prev, [urlCanonique]: { apercu, idLocal } }));
          setPhotos((prev) => [...prev, urlCanonique]);
          return urlCanonique;
        };

        // Sans réseau, inutile de tenter : on met de côté directement.
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          return await mettreEnAttente();
        }

        const { error: uploadError } = await supabase.storage
          .from("visite-photos")
          .upload(path, compressed, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          // L'envoi a échoué alors que le navigateur se croyait en ligne —
          // réseau instable, ce qui est la norme sur un chantier. La photo est
          // mise de côté plutôt que perdue.
          console.warn("[photos] Envoi impossible, mise en attente :", uploadError.message);
          return await mettreEnAttente();
        }

        // Le bucket est privé (SEC-03) : sans signature, la photo qu'on vient
        // de prendre ne s'afficherait pas. L'état porte donc l'URL signée ;
        // elle est ramenée à sa forme canonique à l'enregistrement
        // (`canoniserUrlsStockage`, cf. url-signee.ts).
        const url = (await signerUrl(supabase, urlCanonique)) ?? urlCanonique;

        setPhotos((prev) => [...prev, url]);
        return url;
      } catch (err) {
        console.error("[photos] Préparation impossible :", err);
        setError("Erreur lors de la préparation de la photo.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [photos.length, chantierId, visiteId, reponseId]
  );

  const removePhoto = useCallback(
    async (url: string) => {
      // Photo encore en attente : rien n'existe côté serveur, il faut retirer
      // le fichier d'IndexedDB, sans quoi la synchronisation le monterait
      // ensuite pour une réponse qui ne le référence plus.
      const attente = enAttenteRef.current[url];
      if (attente) {
        await deletePendingPhoto(attente.idLocal);
        URL.revokeObjectURL(attente.apercu);
        setEnAttente((prev) => {
          const suivant = { ...prev };
          delete suivant[url];
          return suivant;
        });
      } else {
        const path = extractStoragePath(url, "visite-photos");
        if (path) {
          const supabase = createClient();
          await supabase.storage.from("visite-photos").remove([path]);
        }
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
    resoudreApercu,
    nbEnAttente: Object.keys(enAttente).length,
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
