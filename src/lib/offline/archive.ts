import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
export class ErreurPreparationArchive extends Error {
  constructor(message: string, public refusConfirme: boolean) { super(message); }
}
/** Cookie côté serveur + identité explicite : une bascule de compte ne peut pas préparer l'autre visite. */
export async function preparerArchiveCloture(scope: OfflineScope, visiteId: string, operationId: string, empreinte: string) {
  assertOfflineScope(scope);
  const response = await fetch(`/api/visites/${visiteId}/archive`, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
    signal: AbortSignal.any([scope.signal, AbortSignal.timeout(150_000)]),
    body: JSON.stringify({ operationId, empreinte, auteurId: scope.userId }),
  });
  assertOfflineScope(scope);
  const data = await response.json();
  if (!response.ok || typeof data.archiveId !== "string") throw new ErreurPreparationArchive(typeof data.error === "string" ? data.error : "Archive non confirmée. Réessayez la même demande.", [400, 409, 413, 422].includes(response.status));
}
