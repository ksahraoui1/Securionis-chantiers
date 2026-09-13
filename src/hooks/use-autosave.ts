"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/utils/constants";
import { savePendingResponse, getUnsyncedResponses } from "@/lib/offline/db";
import { assertOfflineScope } from "@/lib/offline/scope";
import { syncPendingData } from "@/lib/offline/sync";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { canoniserUrlsStockage } from "@/lib/utils/url-signee";
interface AutosaveData { visite_id: string; point_controle_id: string; valeur: string; remarque?: string | null; photos?: string[] }
type SaveStatus = "idle" | "saving" | "saved" | "saved-offline" | "error";
export function useAutosave(visiteId: string) {
  const scope = useOfflineScope();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; if (timer.current) clearTimeout(timer.current); }, [scope]);
  const save = useCallback(async (data: AutosaveData) => {
    const current = ++sequence.current;
    if (timer.current) clearTimeout(timer.current);
    setSaveStatus("saving");
    try {
      assertOfflineScope(scope);
      if (data.visite_id !== visiteId) throw new Error("Visite différente");
      // L'écriture locale est immédiate ; seul le réseau attend la fin de saisie.
      const record = await savePendingResponse(scope, {
        visite_id: data.visite_id, point_controle_id: data.point_controle_id, valeur: data.valeur,
        remarque: data.remarque ?? null, photos: canoniserUrlsStockage(data.photos ?? []), updated_at: new Date().toISOString(),
      });
      if (current !== sequence.current || scope.signal.aborted) return;
      setSaveStatus("saved-offline");
      if (!navigator.onLine) return;
      timer.current = setTimeout(async () => {
        try {
          await syncPendingData(scope);
          const pending = await getUnsyncedResponses(scope);
          if (current === sequence.current) setSaveStatus(pending.some(r => r.key === record.key) ? "saved-offline" : "saved");
        } catch { if (current === sequence.current) setSaveStatus("saved-offline"); }
      }, AUTOSAVE_DEBOUNCE_MS);
    } catch { if (current === sequence.current) setSaveStatus("error"); }
  }, [scope, visiteId]);
  return { save, saveStatus };
}
