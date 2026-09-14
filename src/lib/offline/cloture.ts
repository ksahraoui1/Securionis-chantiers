import { createOfflineClient } from "@/lib/offline/client";
import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { flushOfflineWrites, getUnsyncedResponses, getPendingPhotos } from "@/lib/offline/db";
import { waitOfflinePreparations } from "@/lib/offline/preparations";
import { syncPendingData } from "@/lib/offline/sync";

export type PreparationCloture = { empreinte: string; non_conformites: { id: string; description: string; delai: string | null }[] };
export type DemandeCloture = {
  p_visite_id: string; p_empreinte: string; p_operation_id: string;
  p_ecarts: { reponse_id: string; delai: string | null }[];
  p_renseignements_par: string | null; p_remarques_generales: string | null;
};
export class ErreurCloture extends Error {
  constructor(message: string, public readonly refusConfirme: boolean) { super(message); }
}
async function verifierFile(scope: OfflineScope, visiteId: string) {
  await waitOfflinePreparations(scope);
  await flushOfflineWrites(scope);
  await syncPendingData(scope);
  const [responses, photos] = await Promise.all([getUnsyncedResponses(scope), getPendingPhotos(scope, visiteId)]);
  if (responses.some(r => r.visite_id === visiteId) || photos.length) {
    throw new ErreurCloture("Cette visite contient encore des réponses ou photos locales. Terminez leur synchronisation avant de valider.", true);
  }
  assertOfflineScope(scope);
}
function erreurRpc(error: { code?: string; message: string }): ErreurCloture {
  // Ces erreurs SQL confirment l'annulation de toute la transaction.
  // Une panne réseau ou un résultat mal formé laisse l'issue incertaine.
  const refus = ["40001", "40P01", "42501", "22023", "23503", "23505"].includes(error.code ?? "");
  return new ErreurCloture(refus ? error.message : "La clôture n’a pas pu être confirmée. Réessayez pour vérifier la même demande sans créer de doublon.", refus);
}
export async function preparerCloture(scope: OfflineScope, visiteId: string): Promise<PreparationCloture> {
  await verifierFile(scope, visiteId);
  const client = await createOfflineClient(scope);
  const { data, error } = await client.rpc("preparer_cloture_visite", { p_visite_id: visiteId });
  assertOfflineScope(scope);
  if (error) throw erreurRpc(error);
  if (!data || typeof data.empreinte !== "string" || !/^[0-9a-f]{64}$/.test(data.empreinte) || !Array.isArray(data.non_conformites)
    || data.non_conformites.some((nc: PreparationCloture["non_conformites"][number]) => !nc || typeof nc.id !== "string" || typeof nc.description !== "string" || (nc.delai !== null && typeof nc.delai !== "string"))) {
    throw new ErreurCloture("Préparation de la validation indisponible. Réessayez.", true);
  }
  return data as PreparationCloture;
}
export async function envoyerCloture(scope: OfflineScope, demande: DemandeCloture, reprise = false): Promise<void> {
  // Au rejeu après perte de réponse réseau, interroger d'abord la même demande :
  // la visite peut déjà être terminée et la procédure sait reconnaître son UUID.
  if (!reprise) await verifierFile(scope, demande.p_visite_id);
  const client = await createOfflineClient(scope);
  const { data, error } = await client.rpc("cloturer_visite", demande);
  assertOfflineScope(scope);
  if (error) throw erreurRpc(error);
  if (!data || data.id !== demande.p_visite_id || data.statut !== "terminee") {
    throw new ErreurCloture("La clôture n’a pas pu être confirmée. Réessayez la même demande.", false);
  }
}
