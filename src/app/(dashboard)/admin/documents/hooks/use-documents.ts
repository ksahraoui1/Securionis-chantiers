"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/utils/storage-path";
import type { Tables } from "@/types/database";

export function useDocuments(filterSource: string) {
  const [documents, setDocuments] = useState<Tables<"base_documentaire">[]>([]);
  const [linkedCount, setLinkedCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("base_documentaire")
      .select("*")
      .order("updated_at", { ascending: false });
    if (filterSource) query = query.eq("source", filterSource);

    const { data } = await query;
    if (data) setDocuments(data);

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

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = useCallback(
    async (id: string) => {
      const supabase = createClient();
      const doc = documents.find((d) => d.id === id);
      if (doc) {
        const storagePath = extractStoragePath(doc.fichier_url, "rapports");
        if (storagePath) {
          await supabase.storage.from("rapports").remove([storagePath]);
        }
      }
      await supabase.from("base_documentaire").delete().eq("id", id);
      await reload();
    },
    [documents, reload],
  );

  return { documents, linkedCount, loading, reload, remove };
}
