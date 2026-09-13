"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { syncPendingData } from "@/lib/offline/sync";
import { getPendingCount } from "@/lib/offline/db";
import { OFFLINE_CHANGED_EVENT } from "@/lib/offline/scope";
import { useOfflineScope } from "@/components/ui/offline-provider";
export function useOnlineStatus() {
  const scope = useOfflineScope();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const busy = useRef(false);
  const refreshPendingCount = useCallback(async () => {
    try { const count = await getPendingCount(scope); if (!scope.signal.aborted) setPendingCount(count); }
    catch { if (!scope.signal.aborted) setSyncError("Stockage local indisponible. Vérifiez que vos dernières saisies ont été enregistrées."); }
  }, [scope]);
  const triggerSync = useCallback(async () => {
    if (busy.current || !navigator.onLine || scope.signal.aborted) return;
    busy.current = true; setSyncing(true); setSyncError(null);
    try {
      const result = await syncPendingData(scope);
      if (result.conflicts || result.errors) setSyncError(`${result.conflicts} conflit(s), ${result.errors} élément(s) non envoyé(s). Les données locales sont conservées.`);
      await refreshPendingCount();
    } catch { if (!scope.signal.aborted) setSyncError("Synchronisation impossible. Les données enregistrées restent liées à ce compte."); }
    finally { busy.current = false; if (!scope.signal.aborted) setSyncing(false); }
  }, [scope, refreshPendingCount]);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const online = () => { setIsOnline(true); void triggerSync(); };
    const offline = () => setIsOnline(false);
    const changed = () => { void refreshPendingCount(); };
    window.addEventListener("online", online); window.addEventListener("offline", offline); window.addEventListener(OFFLINE_CHANGED_EVENT, changed);
    void refreshPendingCount();
    if (navigator.onLine) void triggerSync();
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener(OFFLINE_CHANGED_EVENT, changed); };
  }, [scope, refreshPendingCount, triggerSync]);
  return { isOnline, pendingCount, syncing, syncError, triggerSync, refreshPendingCount };
}
