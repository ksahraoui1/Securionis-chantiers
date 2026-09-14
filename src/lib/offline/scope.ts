/** Identité immuable d'une ouverture de session locale ; jamais une identité globale mutable. */
export type OfflineScope = Readonly<{ userId: string; entrepriseId: string | null; database: string; signal: AbortSignal }>;
let active: OfflineScope | null = null;
let controller: AbortController | null = null;
export const OFFLINE_LOCK_KEY = "securionis:session-locked";
export const OFFLINE_CHANGED_EVENT = "securionis:offline-changed";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function activateOfflineScope(userId: string, entrepriseId: string | null): OfflineScope {
  if (!uuid.test(userId) || (entrepriseId !== null && !uuid.test(entrepriseId))) throw new Error("Identité locale invalide");
  deactivateOfflineScope();
  controller = new AbortController();
  active = Object.freeze({ userId, entrepriseId, database: `securionis-offline-v2:${userId}:${entrepriseId ?? "sans-entreprise"}`, signal: controller.signal });
  return active;
}
export function assertOfflineScope(scope: OfflineScope): void {
  if (active !== scope || scope.signal.aborted || isOfflineLocked()) throw new Error("La session locale a changé. Reconnectez-vous.");
}
export function deactivateOfflineScope(): void {
  controller?.abort();
  controller = null;
  active = null;
}
export function isOfflineLocked(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(OFFLINE_LOCK_KEY) === "1" || sessionStorage.getItem(OFFLINE_LOCK_KEY) === "1"; }
  catch { return true; } // Un contexte qui ne peut isoler les sessions reste fermé.
}
export function lockOfflineSession(): void {
  deactivateOfflineScope();
  try { localStorage.setItem(OFFLINE_LOCK_KEY, "1"); sessionStorage.setItem(OFFLINE_LOCK_KEY, "1"); } catch { /* La session en mémoire est déjà arrêtée. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_LOCK_KEY));
}
/** Seulement après une authentification réussie, jamais au simple montage d'une page. */
export function unlockOfflineSessionAfterLogin(): void {
  localStorage.removeItem(OFFLINE_LOCK_KEY);
  sessionStorage.removeItem(OFFLINE_LOCK_KEY);
}

/** Préférences de visite : même frontière que la file IndexedDB. */
export function offlinePreferenceKey(scope: OfflineScope, name: string): string {
  assertOfflineScope(scope);
  return `${scope.database}:${name}`;
}
