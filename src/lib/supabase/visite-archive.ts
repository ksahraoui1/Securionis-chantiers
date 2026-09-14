import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/types/database";
import { referenceStockage, cheminStockageValide } from "@/lib/utils/storage-reference";
import { getSupabaseUrl } from "@/lib/env";

export class ArchiveError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export type SourceVisite = {
  chantier: Tables<"chantiers">; visite: Tables<"visites">;
  inspecteur: { nom: string; email: string; entreprise_id: string };
  entreprise: Tables<"entreprises">;
  reponses: (Tables<"reponses"> & { points_controle: Tables<"points_controle"> })[];
  ecarts: Tables<"ecarts">[]; destinataires: Tables<"destinataires">[];
  documents_points: Record<string, unknown>[]; bibliotheque: Record<string, unknown>[];
};
type FichierSource = { bucket: "rapports" | "visite-photos"; reference: string; type: "image" | "document" };
export type FichierArchive = FichierSource & { chemin: string; sha256: string; taille: number; mime: string };
export type ArchiveVisite = { id: string; visite_id: string; sha256: string; mode: "cloture" | "reprise_historique"; created_at: string; contenu: string };
export type ContenuArchive = { format: string; mode: ArchiveVisite["mode"]; source: SourceVisite; fichiers: FichierArchive[]; auteur_id: string; capture_le: string };
function erreurBase(error: { code?: string } | null): never {
  throw new ArchiveError(error?.code === "40001" ? "Les sources ont changé. Reprenez la validation." : error?.code === "42501" ? "Accès aux sources refusé." : "Archivage non confirmé. Conservez la demande et réessayez.", error?.code === "40001" ? 409 : error?.code === "42501" ? 403 : 503);
}
/** Une copie échouée reste non publiée ; jamais de suppression sur issue réseau incertaine. */
export async function preparerArchive(userClient: SupabaseClient, service: SupabaseClient, demande: {
  visiteId: string; operationId: string; auteurId: string; empreinte: string | null;
}) {
  const { data, error } = await userClient.rpc("preparer_archive_visite", {
    p_visite_id: demande.visiteId, p_operation_id: demande.operationId, p_empreinte: demande.empreinte,
  });
  if (error || !data) erreurBase(error);
  if (typeof data.archive_id === "string") return data.archive_id as string;
  if (data.preparee === true) return demande.operationId;
  if (!data.source?.chantier?.id || !Array.isArray(data.fichiers) || data.fichiers.length > 300) throw new ArchiveError("Sources d’archive invalides ou trop nombreuses.");
  await verifierQuotaArchive(service, demande.auteurId, "copy");
  const fichiers: FichierArchive[] = [];
  let total = 0;
  const tentative = randomUUID();
  const signal = AbortSignal.timeout(120_000);
  for (const fichier of data.fichiers as FichierSource[]) {
    const ref = referenceStockage(fichier.reference);
    const chemin = ref ? (ref.bucket === fichier.bucket ? ref.chemin : null) : (fichier.bucket === "rapports" && cheminStockageValide(fichier.reference) && !fichier.reference.includes(":") ? fichier.reference : null);
    if (!chemin || !["rapports", "visite-photos"].includes(fichier.bucket)) throw new ArchiveError("Un fichier source est hors du stockage autorisé.");
    const fetchOptions = { signal, redirect: "error" as const };
    const { data: stream, error: downloadError } = await userClient.storage.from(fichier.bucket).download(chemin, {}, fetchOptions).asStream();
    if (downloadError || !stream) throw new ArchiveError("Un fichier source est inaccessible. L’archive et la clôture ne sont pas validées.");
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let taille = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        taille += value.byteLength; total += value.byteLength;
        if (taille > (fichier.type === "image" ? 10 : 50) * 1024 * 1024 || total > 100 * 1024 * 1024) throw new ArchiveError("Sources trop volumineuses : 10 Mo par image, 50 Mo par document, 100 Mo au total.");
        parts.push(value);
      }
    } finally {
      try { await reader.cancel(); } catch { /* Le flux peut déjà être fermé. */ }
      reader.releaseLock();
    }
    const bytes = Buffer.concat(parts);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const pdf = fichier.type === "document" && bytes.subarray(0, 5).toString() === "%PDF-";
    if (!png && !jpg && !pdf) throw new ArchiveError("Un fichier source n’est pas un PNG, JPEG ou PDF valide.");
    const mime = png ? "image/png" : jpg ? "image/jpeg" : "application/pdf";
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const racine = fichier.bucket === "visite-photos" ? `${data.source.chantier.id}/archives/${demande.visiteId}` : `${data.source.chantier.id}/visites/${demande.visiteId}/sources`;
    const cible = `${racine}/${demande.operationId}/${tentative}/${sha256}.${png ? "png" : jpg ? "jpg" : "pdf"}`;
    // Deux références distinctes peuvent contenir exactement les mêmes octets.
    if (!fichiers.some(f => f.bucket === fichier.bucket && f.chemin === cible)) {
      const { error: uploadError } = await service.storage.from(fichier.bucket).upload(cible, bytes, { contentType: mime, upsert: false });
      if (uploadError) throw new ArchiveError("Copie des sources interrompue. Réessayez la même demande.", 503);
    }
    fichiers.push({ ...fichier, chemin: cible, sha256, taille, mime });
  }
  const result = await service.rpc("enregistrer_preparation_archive", {
    p_id: demande.operationId, p_visite_id: demande.visiteId, p_auteur_id: demande.auteurId,
    p_empreinte: data.empreinte, p_fichiers: fichiers, p_mode: data.mode,
  });
  if (result.error || typeof result.data !== "string") erreurBase(result.error);
  return result.data as string;
}
export async function lireArchive(client: SupabaseClient, visiteId: string): Promise<ArchiveVisite | null> {
  const { data, error } = await client.from("visite_archives").select("id,visite_id,sha256,mode,created_at,contenu").eq("visite_id", visiteId).maybeSingle();
  if (error) throw new ArchiveError("Lecture de l’archive indisponible.", 503);
  if (!data) return null;
  verifierArchive(data as ArchiveVisite);
  return data as ArchiveVisite;
}
export function verifierArchive(archive: ArchiveVisite): ContenuArchive {
  if (createHash("sha256").update(archive.contenu, "utf8").digest("hex") !== archive.sha256) throw new ArchiveError("L’intégrité de l’archive ne peut pas être confirmée.", 503);
  const contenu = JSON.parse(archive.contenu) as ContenuArchive;
  if (contenu.format !== "securionis-archive-v1" || contenu.mode !== archive.mode || contenu.source?.visite?.id !== archive.visite_id || !Array.isArray(contenu.fichiers)) throw new ArchiveError("Archive invalide.", 503);
  return contenu;
}
/** Les URLs fournies au chargeur désignent uniquement les copies de l'archive. */
export function sourceRapportArchive(archive: ArchiveVisite): SourceVisite {
  const contenu = verifierArchive(archive);
  const url = (reference: string, bucket: string) => {
    const fichier = contenu.fichiers.find(f => f.reference === reference && f.bucket === bucket);
    if (!fichier || !cheminStockageValide(fichier.chemin)) throw new ArchiveError("Une copie de source manque au manifeste.", 503);
    return `${getSupabaseUrl()}/storage/v1/object/public/${bucket}/${fichier.chemin}`;
  };
  return { ...contenu.source,
    entreprise: { ...contenu.source.entreprise, logo_url: contenu.source.entreprise?.logo_url ? url(contenu.source.entreprise.logo_url, "rapports") : null },
    reponses: contenu.source.reponses.map(r => ({ ...r, photos: (r.photos ?? []).map(p => url(p, "visite-photos")) })),
  };
}

/** Export portable : contenu canonique et octets vérifiés avant de produire le ZIP. */
export async function exporterArchive(client: SupabaseClient, archive: ArchiveVisite): Promise<Buffer> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const contenu = verifierArchive(archive);
  zip.file("archive.json", JSON.stringify(archive, null, 2));
  zip.file("contenu-canonique.json", archive.contenu);
  zip.file("LISEZ-MOI.txt", `Archive Securionis ${archive.id}\nSHA-256 du fichier contenu-canonique.json (octets UTF-8) : ${archive.sha256}\nLes fichiers sont rangés sous fichiers/<bucket>/<chemin du manifeste>. Leur SHA-256 figure dans le manifeste.\nMode : ${archive.mode}. Une reprise historique représente les sources à la date de copie ; elle ne certifie pas leur état à la date de visite.\n`);
  let total = 0;
  const seen = new Set<string>();
  const options = { signal: AbortSignal.timeout(120_000), redirect: "error" as const };
  for (const f of contenu.fichiers) {
    const key = `${f.bucket}/${f.chemin}`;
    if (seen.has(key)) continue;
    if (!cheminStockageValide(f.chemin) || !["rapports", "visite-photos"].includes(f.bucket)) throw new ArchiveError("Chemin d’archive invalide.");
    const { data, error } = await client.storage.from(f.bucket).download(f.chemin, {}, options).asStream();
    if (error || !data) throw new ArchiveError("Un fichier archivé est inaccessible. L’export est interrompu.", 503);
    const reader = data.getReader(); const chunks: Uint8Array[] = []; let taille = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        taille += value.byteLength; total += value.byteLength;
        if (taille > 50 * 1024 * 1024 || total > 100 * 1024 * 1024) throw new ArchiveError("Archive trop volumineuse.");
        chunks.push(value);
      }
    } finally { try { await reader.cancel(); } catch { /* fermé */ } reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== f.taille || createHash("sha256").update(bytes).digest("hex") !== f.sha256) throw new ArchiveError("L’intégrité d’un fichier archivé ne peut pas être confirmée.", 503);
    zip.file(`fichiers/${key}`, bytes); seen.add(key);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

/** Une opération de copie/export ne démarre pas si le comptage est indisponible. */
export async function verifierQuotaArchive(service: SupabaseClient, auteurId: string, action: "copy" | "zip") {
  const { data, error } = await service.rpc("consommer_quota", { p_cle: `archive-${action}:${auteurId}`, p_max: 5, p_fenetre_s: 3600 });
  if (error || typeof data !== "boolean") throw new ArchiveError("Vérification du quota indisponible. Réessayez plus tard.", 503);
  if (!data) throw new ArchiveError("Limite de cinq opérations par heure atteinte. Réessayez plus tard.", 429);
}
