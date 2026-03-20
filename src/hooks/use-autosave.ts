"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { AUTOSAVE_DEBOUNCE_MS, STATUTS_VISITE } from "@/lib/utils/constants";

interface AutosaveData {
  visite_id: string;
  point_controle_id: string;
  valeur: string;
  remarque?: string | null;
  photos?: string[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutosave(visiteId: string) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTransitionedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const save = useCallback(
    async (data: AutosaveData) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          const supabase = createClient();

          const { error } = await supabase.from("reponses").upsert(
            {
              visite_id: data.visite_id,
              point_controle_id: data.point_controle_id,
              valeur: data.valeur,
              remarque: data.remarque ?? null,
              photos: data.photos ?? [],
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "visite_id,point_controle_id",
            }
          );

          if (error) {
            setSaveStatus("error");
            return;
          }

          if (!hasTransitionedRef.current) {
            hasTransitionedRef.current = true;
            await supabase
              .from("visites")
              .update({
                statut: STATUTS_VISITE.EN_COURS,
                updated_at: new Date().toISOString(),
              })
              .eq("id", visiteId)
              .eq("statut", STATUTS_VISITE.BROUILLON);
          }

          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [visiteId]
  );

  return { save, saveStatus };
}
