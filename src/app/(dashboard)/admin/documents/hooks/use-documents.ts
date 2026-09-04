"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/utils/storage-path";
import type { Tables } from "@/types/database";
import { signerUrls } from "@/lib/utils/url-signee";

export function useDocuments(filterSource: string) {
  const [documents, setDocuments] = useState<Tables<"base_documentaire">[]>([]);
  const [linkedCount, setLinkedCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Numéro de la requête en cours : deux changements de filtre rapprochés
  // peuvent revenir dans le désordre, la première réponse écrasant alors la
  // seconde.
  const requeteRef = useRef(0);

  const reload = useCallback(async () => {
    const requete = ++requeteRef.current;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("base_documentaire")
      .select("*")
      .order("updated_at", { ascending: false });
    if (filterSource) query = query.eq("source", filterSource);

    const { data } = await query;
    // Le bucket est privé (SEC-03) : les liens de téléchargement doivent être
    // signés. On signe au chargement — le point de passage unique — plutôt
    // qu'à chaque endroit qui affiche un lien.
    if (data) {
      const signees = await signerUrls(supabase, data.map((d) => d.fichier_url));
      if (requete !== requeteRef.current) return; // une requête plus récente a pris la main
      setDocuments(data.map((d, i) => ({ ...d, fichier_url: signees[i] ?? d.fichier_url })));
    }

    const { data: liens } = await supabase
      .from("point_controle_doc_liens")
      .select("document_id");
    if (liens) {
      const counts: Record<string, number> = {};
      liens.forEach((l) => {
        counts[l.document_id] = (counts[l.document_id] ?? 0) + 1;
      });
      setLinkedCount(counts);
    }

    setLoading(false);
  }, [filterSource]);

  // Chargement au montage et au changement de filtre. Réponses obsolètes
  // écartées par `requeteRef` ci-dessus.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  /**
   * Supprime un document : la ligne d'abord, le fichier ensuite, résultat
   * vérifié (INT-03). Renvoie un message d'erreur, ou `null` si tout est
   * passé. Un refus RLS ne lève aucune erreur — il ne touche aucune ligne —
   * et l'ordre inverse effaçait le fichier d'un document qui restait listé.
   */
  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const supabase = createClient();
      const doc = documents.find((d) => d.id === id);

      const { data: supprimes, error: dbError } = await supabase
        .from("base_documentaire")
        .delete()
        .eq("id", id)
        .select("id");
      if (dbError) return dbError.message;
      if (!supprimes || supprimes.length === 0) {
        return "Suppression refusée : réservée à un administrateur.";
      }

      let avertissement: string | null = null;
      if (doc) {
        const storagePath = extractStoragePath(doc.fichier_url, "rapports");
        if (storagePath) {
          const { error: storageError } = await supabase.storage
            .from("rapports")
            .remove([storagePath]);
          if (storageError) {
            avertissement = `Document retiré, mais son fichier n'a pas pu être effacé du stockage (${storageError.message}).`;
          }
        }
      }
      await reload();
      return avertissement;
    },
    [documents, reload],
  );

  return { documents, linkedCount, loading, reload, remove };
}
