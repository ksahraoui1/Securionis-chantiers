"use client";

import { useState } from "react";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { createOfflineBackup } from "@/lib/offline/backup";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const scope = useOfflineScope();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function exportBackup() {
    setExporting(true); setExportError(null);
    try {
      const blob = await createOfflineBackup(scope);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url;
      link.download = `securionis-saisies-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { setExportError("La copie n’a pas pu être créée. Les saisies sont toujours conservées sur cet appareil."); }
    finally { setExporting(false); }
  }
  const { isOnline, pendingCount, syncing, syncError, triggerSync } = useOnlineStatus();

  if (isOnline && pendingCount === 0 && !syncError) return null;

  return (
    <div
      className={`px-4 py-2 text-sm font-medium text-center ${
        isOnline
          ? "bg-amber-50 text-amber-800 border-b border-amber-200"
          : "bg-red-50 text-red-800 border-b border-red-200"
      }`}
    >
      {exportError && <p role="alert">{exportError}</p>}
      {syncError && <p role="status">{syncError}</p>}
      {!isOnline && (
        <span>
          Hors-ligne — gardez cette visite ouverte. Vérifiez l’état de sauvegarde de vos saisies.
        </span>
      )}
      {isOnline && pendingCount > 0 && (
        <span className="inline-flex items-center gap-2">
          {syncing ? (
            <>Synchronisation en cours...</>
          ) : (
            <>
              {pendingCount} modification{pendingCount > 1 ? "s" : ""} en
              attente
              <button
                onClick={triggerSync}
                className="underline font-semibold hover:no-underline"
              >
                Synchroniser
              </button>
            </>
          )}
        </span>
      )}
      {pendingCount > 0 && <div className="mt-1">
        <a href="/compte/saisies" className="mr-4 underline font-semibold">Comparer et reprendre mes saisies</a>
        <button onClick={exportBackup} disabled={exporting} className="underline font-semibold disabled:opacity-50">
          {exporting ? "Préparation de la copie…" : "Exporter mes saisies conservées"}
        </button>
        <span className="block text-xs">Copie de récupération avec les photos. Les saisies restent sur cet appareil.</span>
      </div>}
    </div>
  );
}
