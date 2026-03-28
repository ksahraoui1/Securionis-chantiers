"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const { isOnline, pendingCount, syncing, triggerSync } = useOnlineStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`lg:pl-[260px] transition-all duration-300`}
    >
      <div
        className={`px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${
          isOnline
            ? "bg-amber-50 text-amber-800 border-b border-amber-200/60"
            : "bg-red-50 text-red-800 border-b border-red-200/60"
        }`}
      >
        {!isOnline && (
          <span className="inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-base">cloud_off</span>
            Hors-ligne — les modifications sont sauvegardées localement
          </span>
        )}
        {isOnline && pendingCount > 0 && (
          <span className="inline-flex items-center gap-2">
            {syncing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Synchronisation en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">sync</span>
                {pendingCount} modification{pendingCount > 1 ? "s" : ""} en
                attente
                <button
                  onClick={triggerSync}
                  className="ml-1 underline font-semibold hover:no-underline transition-all"
                >
                  Synchroniser
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
