import { createClient, getAuthStorageKey } from "@/lib/supabase/client";
import { lockOfflineSession, type OfflineScope } from "@/lib/offline/scope";
import { flushOfflineWrites, purgeReadCache } from "@/lib/offline/db";

export async function purgePrivatePageCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith("securionis-pages-")).map(name => caches.delete(name)));
}
/** Supabase SSR utilise ces cookies accessibles au navigateur, path=/.
 * Effacer aussi localement si la révocation distante échoue (appareil hors ligne).
 */
export function clearLocalSessionCookies(): void {
  const key = getAuthStorageKey();
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    const suffix = name.slice(key.length);
    if (name.startsWith(key) && (suffix === "" || /^\.\d+$/.test(suffix) || /^-code-verifier(?:\.\d+)?$/.test(suffix))) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }
  }
}
export async function logoutOfflineSession(scope?: OfflineScope): Promise<boolean> {
  // Lancer la purge avant de fermer le périmètre : seules les écritures déjà
  // acceptées peuvent ensuite se terminer, toujours dans leur base d'origine.
  const purge = scope ? purgeReadCache(scope).catch(() => {}) : Promise.resolve();
  lockOfflineSession();
  await Promise.allSettled([purge, scope ? flushOfflineWrites(scope) : Promise.resolve(), purgePrivatePageCaches()]);
  let revoked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      createClient().auth.signOut(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 5000); }),
    ]);
    revoked = result !== null && !result.error;
  } catch { revoked = false; }
  finally { clearTimeout(timer); clearLocalSessionCookies(); }
  return revoked;
}
