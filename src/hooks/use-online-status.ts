"use client";

import { useState, useEffect, useCallback } from "react";
import { syncPendingData } from "@/lib/offline/sync";
import { getPendingCount } from "@/lib/offline/db";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
      // Auto-sync quand le réseau revient
      triggerSync();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Vérifier le nombre de pending au montage
    refreshPendingCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB non disponible
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    try {
      await syncPendingData();
      await refreshPendingCount();
    } catch {
      // Sync failed, sera retentée
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshPendingCount]);

  return { isOnline, pendingCount, syncing, triggerSync, refreshPendingCount };
}
