import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cheminVersionRapport } from "@/lib/utils/storage-reference";

export class PublicationRapportError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Un fichier neuf, puis publication atomique de la référence et de sa preuve. */
export async function enregistrerVersionRapport(service: SupabaseClient, donnees: {
  versionId: string; visiteId: string; chantierId: string; auteurId: string;
  referenceAttendue: string | null; motif: string; source: Record<string, unknown>; pdf: Buffer;
}) {
  const chemin = cheminVersionRapport(donnees.chantierId, donnees.visiteId, donnees.versionId);
  if (Buffer.byteLength(JSON.stringify(donnees.source)) > 2 * 1024 * 1024) {
    throw new PublicationRapportError("Les données du rapport sont trop volumineuses.", 422);
  }
  const sha256 = createHash("sha256").update(donnees.pdf).digest("hex");
  const { error: uploadError } = await service.storage.from("rapports").upload(chemin, donnees.pdf, {
    contentType: "application/pdf", upsert: false,
  });
  if (uploadError) throw new PublicationRapportError("Enregistrement du fichier impossible.", 500);
  const { data, error } = await service.rpc("publier_version_rapport", {
    p_id: donnees.versionId, p_visite_id: donnees.visiteId, p_auteur_id: donnees.auteurId,
    p_reference_attendue: donnees.referenceAttendue, p_sha256: sha256,
    p_motif: donnees.motif, p_source: donnees.source,
  });
  // Une coupure peut cacher un commit réussi : ne jamais supprimer le fichier
  // automatiquement sur erreur. Un objet non publié sera revu séparément.
  if (error || data !== donnees.versionId) {
    console.error("Publication de rapport non confirmée", { versionId: donnees.versionId, code: error?.code });
    throw new PublicationRapportError(
      error?.code === "40001" ? "Un autre rapport a été publié. Rechargez la page." : "Publication du rapport non confirmée. Rechargez la page avant de réessayer.",
      error?.code === "40001" ? 409 : error?.code === "42501" ? 403 : 500,
    );
  }
  return { chemin, sha256, versionId: donnees.versionId };
}

export const nouvelleVersionRapport = randomUUID;
