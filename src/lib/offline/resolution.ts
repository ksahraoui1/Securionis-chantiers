import { createOfflineClient } from "@/lib/offline/client";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { draftsForKey, readLocalSnapshot, responseSnapshotToken, stageResponseResolution, type LocalSnapshot, type PendingResponse } from "@/lib/offline/db";
import { syncPendingData } from "@/lib/offline/sync";

export type ResponseContent = Pick<PendingResponse, "valeur" | "remarque" | "photos">;
export interface RemoteResponse extends ResponseContent { sync_revision: string; updated_at: string }
export interface ResponseComparison {
  key: string; visite_id: string; point_controle_id: string; localToken: string;
  drafts: PendingResponse[]; remote: RemoteResponse | null;
  title: string; visitLabel: string; chantier_id: string; closed: boolean;
}
const values = ["conforme", "non_conforme", "pas_necessaire", "remarques"];
export function validateResponseContent(content: ResponseContent): void {
  if (!values.includes(content.valeur) || (content.remarque !== null && (typeof content.remarque !== "string" || content.remarque.length > 20000))
    || !Array.isArray(content.photos) || content.photos.length > 10 || content.photos.some(p => typeof p !== "string" || p.length > 4096)) {
    throw new Error("Réponse invalide : choisissez un constat, une remarque de moins de 20 000 caractères et au plus 10 photos.");
  }
}
export async function compareResponse(scope: OfflineScope, key: string, snapshot?: LocalSnapshot): Promise<ResponseComparison> {
  const state = snapshot ?? await readLocalSnapshot(scope);
  const drafts = draftsForKey(state, key);
  if (!drafts.length) throw new Error("Cette saisie a déjà été traitée. Actualisez la liste.");
  const first = drafts[0];
  const client = await createOfflineClient(scope);
  const [visit, response, point] = await Promise.all([
    client.from("visites").select("id,chantier_id,date_visite,statut").eq("id", first.visite_id).single(),
    client.from("reponses").select("valeur,remarque,photos,sync_revision,updated_at").eq("visite_id", first.visite_id).eq("point_controle_id", first.point_controle_id).maybeSingle(),
    client.from("points_controle").select("intitule").eq("id", first.point_controle_id).single(),
  ]);
  assertOfflineScope(scope);
  if (visit.error || !visit.data || response.error || point.error || !point.data) {
    throw new Error("Comparaison indisponible : vérifiez votre connexion et vos droits sur cette visite. Les copies restent conservées.");
  }
  if (response.data && typeof response.data.sync_revision !== "string") throw new Error("Version serveur non vérifiable.");
  return { key, visite_id: first.visite_id, point_controle_id: first.point_controle_id,
    localToken: responseSnapshotToken(drafts), drafts: drafts.filter(r => r.synced === 0),
    remote: response.data ? { ...response.data, photos: response.data.photos ?? [] } as RemoteResponse : null,
    title: point.data.intitule, visitLabel: `Visite du ${visit.data.date_visite}`, chantier_id: visit.data.chantier_id,
    closed: visit.data.statut === "terminee" };
}
/** Relecture + choix local atomique + CAS serveur : aucun choix ne force un écrasement. */
export async function resolveResponse(scope: OfflineScope, comparison: ResponseComparison,
  decision: { type: "content"; content: ResponseContent } | { type: "server" } | { type: "archive" }): Promise<{ sent: boolean }> {
  assertOfflineScope(scope);
  const fresh = await compareResponse(scope, comparison.key);
  if ((fresh.remote?.sync_revision ?? null) !== (comparison.remote?.sync_revision ?? null) || fresh.closed !== comparison.closed) {
    throw new Error("La réponse serveur a changé. Actualisez la comparaison avant de choisir.");
  }
  if (fresh.localToken !== comparison.localToken) throw new Error("Une saisie locale a changé. Actualisez la comparaison.");
  if (decision.type === "content" && fresh.closed) throw new Error("Cette visite est clôturée. Conservez la copie pour un avenant.");
  if (decision.type === "archive" || (decision.type === "server" && fresh.closed)) {
    // Classement volontaire : conserve tous les brouillons et leurs photos,
    // sans supprimer ni modifier une réponse serveur.
    await stageResponseResolution(scope, comparison.key, comparison.localToken, null);
    return { sent: false };
  }
  const content = decision.type === "server" ? fresh.remote : decision.content;
  if (!content) throw new Error("Aucune réponse serveur à conserver. Vous pouvez classer la saisie dans vos copies locales.");
  validateResponseContent(content);
  const revision = crypto.randomUUID();
  const next: PendingResponse = { key: comparison.key, revision, visite_id: comparison.visite_id, point_controle_id: comparison.point_controle_id,
    valeur: content.valeur, remarque: content.remarque, photos: [...content.photos], updated_at: new Date().toISOString(), synced: 0,
    base_revision: fresh.remote?.sync_revision ?? null, ancestors: [], editor_id: `resolution:${revision}` };
  await stageResponseResolution(scope, comparison.key, comparison.localToken, next);
  await syncPendingData(scope);
  assertOfflineScope(scope);
  const latest = (await readLocalSnapshot(scope)).responses.find(r => r.key === comparison.key);
  if (latest?.revision !== revision || latest.synced !== 1) {
    throw new Error("Votre choix est conservé sur cet appareil. L’envoi n’a pas été confirmé ; actualisez la comparaison pour reprendre.");
  }
  return { sent: true };
}
