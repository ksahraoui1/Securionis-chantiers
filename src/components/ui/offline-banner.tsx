"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const { isOnline, pendingCount, syncing, triggerSync } = useOnlineStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`px-4 py-2 text-sm font-medium text-center ${
        isOnline
          ? "bg-amber-50 text-amber-800 border-b border-amber-200"
          : "bg-red-50 text-red-800 border-b border-red-200"
      }`}
    >
      {!isOnline && (
        <span>
          Hors-ligne — les modifications sont sauvegardées localement
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
    </div>
  );
}
