import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TAILLE_PREUVE, validerNomPreuve, type PieceEcart } from "@/lib/ecarts/pieces";
export class PieceError extends Error {
  constructor(message: string, public status: number, public refusConfirme = true) { super(message); }
}
export async function lireFluxPreuve(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_TAILLE_PREUVE) throw new PieceError("Le fichier dépasse 5 Mo.", 413);
      chunks.push(value);
    }
  } finally { try { await reader.cancel(); } catch { /* Flux fermé. */ } reader.releaseLock(); }
  if (!total) throw new PieceError("Le fichier est vide.", 400);
  return Buffer.concat(chunks);
}
export function identifierPreuve(nom: string, bytes: Buffer): { mime: string; ext: string; sha256: string } {
  try { validerNomPreuve(nom); } catch (e) { throw new PieceError((e as Error).message, 400); }
  if (!bytes.length || bytes.length > MAX_TAILLE_PREUVE) throw new PieceError("Taille de pièce invalide.", 413);
  const ext = nom.split(".").pop()!.toLowerCase();
  const pdf = ext === "pdf" && bytes.subarray(0, 5).toString() === "%PDF-";
  const png = ext === "png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = ["jpg", "jpeg"].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!pdf && !png && !jpeg) throw new PieceError("Le contenu ne correspond pas au format PDF, JPEG ou PNG annoncé.", 400);
  return { mime: pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", ext: pdf ? "pdf" : png ? "png" : "jpg", sha256: createHash("sha256").update(bytes).digest("hex") };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cheminPiece(entrepriseId: string, ecartId: string, id: string, sha256: string, mime: string): string {
  if (![entrepriseId, ecartId, id].every(x => UUID.test(x)) || !/^[0-9a-f]{64}$/.test(sha256) || !["application/pdf", "image/png", "image/jpeg"].includes(mime)) throw new PieceError("Référence de pièce invalide.", 400);
  return `${entrepriseId}/${ecartId}/${id}/${sha256}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
}
const downloadOptions = () => ({signal: AbortSignal.timeout(30_000), redirect: "error" as const});
export async function chargerPiece(service: SupabaseClient, piece: PieceEcart & {storage_path: string; ecart_id: string}, entrepriseId: string): Promise<Buffer> {
  const chemin = cheminPiece(entrepriseId, piece.ecart_id, piece.id, piece.sha256, piece.mime);
  if (chemin !== piece.storage_path) throw new PieceError("Référence de preuve incohérente.", 503);
  const { data, error } = await service.storage.from("ecart-preuves").download(chemin, {}, downloadOptions()).asStream();
  if (error || !data) throw new PieceError("Pièce indisponible.", 503);
  const bytes = await lireFluxPreuve(data);
  if (bytes.length !== piece.taille || createHash("sha256").update(bytes).digest("hex") !== piece.sha256) throw new PieceError("L’intégrité de cette pièce ne peut pas être confirmée.", 503);
  return bytes;
}
export async function stockerPiece(service: SupabaseClient, chemin: string, bytes: Buffer, mime: string): Promise<void> {
  const { error } = await service.storage.from("ecart-preuves").upload(chemin, bytes, {contentType: mime, upsert: false});
  if (!error) return;
  // Une réponse perdue après upload laisse un objet : vérifier ses octets au rejeu.
  if (String(error.statusCode) !== "409") throw new PieceError("Enregistrement non confirmé. Réessayez le même fichier.", 503, false);
  const {data, error: lectureError} = await service.storage.from("ecart-preuves").download(chemin, {}, downloadOptions()).asStream();
  if (lectureError || !data || !(await lireFluxPreuve(data)).equals(bytes)) throw new PieceError("Le fichier existant ne peut pas être confirmé.", 503, false);
}
