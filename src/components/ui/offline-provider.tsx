"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasLegacyOfflineDatabase } from "@/lib/offline/db";
import { activateOfflineScope, deactivateOfflineScope, isOfflineLocked, OFFLINE_LOCK_KEY, type OfflineScope } from "@/lib/offline/scope";

const ScopeContext = createContext<OfflineScope | null>(null);
export function useOfflineScope(): OfflineScope {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("Session locale non initialisée");
  return scope;
}
export function OfflineProvider({ userId, entrepriseId, children }: { userId: string; entrepriseId: string | null; children: React.ReactNode }) {
  const [scope, setScope] = useState<OfflineScope | null>(null);
  const [locked, setLocked] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const privateView = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false, invalidated = false;
    let current: OfflineScope | null = null;
    const stop = () => {
      invalidated = true;
      if (privateView.current) privateView.current.hidden = true;
      if (current && !current.signal.aborted) deactivateOfflineScope();
      if (!disposed) { setScope(null); setLocked(true); }
    };
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) stop();
    });
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (disposed || invalidated) return;
      if (error || session?.user.id !== userId || isOfflineLocked()) { stop(); return; }
      current = activateOfflineScope(userId, entrepriseId);
      current.signal.addEventListener("abort", stop, { once: true });
      setScope(current);
      setLocked(false);
      void hasLegacyOfflineDatabase().then(value => { if (!disposed) setLegacy(value); }).catch(() => {});
    }).catch(stop);
    const onStorage = (event: StorageEvent) => { if (event.key === OFFLINE_LOCK_KEY && event.newValue === "1") stop(); };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!disposed && (session?.user.id !== userId || isOfflineLocked())) stop();
      }).catch(stop);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(OFFLINE_LOCK_KEY, stop);
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      subscription.unsubscribe();
      current?.signal.removeEventListener("abort", stop);
      if (current && !current.signal.aborted) deactivateOfflineScope();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(OFFLINE_LOCK_KEY, stop);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, entrepriseId]);
  return <>
    {!scope && <div className="mx-auto max-w-lg p-8 text-center">
      <p>{locked ? "Cette session locale est verrouillée. Les modifications enregistrées restent liées à leur compte." : "Vérification de la session…"}</p>
      {locked && <a className="mt-4 inline-block text-blue-700 underline" href="/login">Se reconnecter</a>}
    </div>}
    <div ref={privateView} hidden={!scope}>
      {scope && <ScopeContext.Provider value={scope}>
        {legacy && <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">Un ancien stockage local sans propriétaire identifié est conservé à part. Si vous aviez des modifications non envoyées avant cette mise à jour, contactez votre administrateur pour leur récupération.</p>}
        {children}
      </ScopeContext.Provider>}
    </div>
  </>;
}
