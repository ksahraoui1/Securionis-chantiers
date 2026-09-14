import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { storeImportedDrafts, type PendingPhoto, type PendingResponse, type SavedResolution } from "@/lib/offline/db";
import { validateResponseContent } from "@/lib/offline/resolution";
import { referenceStockage } from "@/lib/utils/storage-reference";
import { getSupabaseUrl } from "@/lib/env";

const MAX_FILE = 100 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Structure de sauvegarde invalide");
  return value as Record<string, unknown>;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Taille ou structure de sauvegarde invalide");
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw new Error("Identifiant de sauvegarde invalide");
  return value;
}
async function digest(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
export interface PreparedImport {
  id: string; userId: string; entrepriseId: string | null;
  responses: PendingResponse[]; photos: PendingPhoto[]; copies: SavedResolution[];
}
/** Aucune requête réseau. Une sauvegarde d'un autre compte n'est jamais réattribuée. */
export async function prepareBackupImport(scope: OfflineScope, file: Blob): Promise<PreparedImport> {
  assertOfflineScope(scope);
  if (file.size > MAX_FILE) throw new Error("La sauvegarde dépasse 100 Mo.");
  let raw: Record<string, unknown>;
  const text = await file.text();
  try { raw = object(JSON.parse(text)); } catch { throw new Error("Ce fichier n’est pas une sauvegarde JSON valide."); }
  if (!["securionis-offline-backup-v1", "securionis-offline-backup-v2"].includes(String(raw.format))) throw new Error("Format de sauvegarde non reconnu.");
  if (raw.user_id !== scope.userId || raw.entreprise_id !== scope.entrepriseId) throw new Error("Cette sauvegarde appartient à un autre compte ou à une autre entreprise.");
  const hash = await digest(text), id = `import:${hash}`;
  let totalBytes = 0, totalResponses = 0, totalPhotos = 0;
  const group = (responsesInput: unknown[], photosInput: unknown[], tag: string) => {
    const mapping = new Map<string, string>();
    const photos = photosInput.map((item, index): PendingPhoto => {
      const p = object(item), chantier = identifier(p.chantier_id), visite = identifier(p.visite_id), key = identifier(p.reponse_key);
      if (typeof p.filename !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(p.filename) || p.filename.includes("..")
        || typeof p.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64)
        || p.base64.length > 14 * 1024 * 1024 || !["image/jpeg", "image/png"].includes(String(p.mime_type))) throw new Error("Photo de sauvegarde invalide.");
      const binary = atob(p.base64), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      totalBytes += bytes.length; totalPhotos++;
      if (!bytes.length || bytes.length > 10 * 1024 * 1024 || totalBytes > 75 * 1024 * 1024 || totalPhotos > 1000) throw new Error("La sauvegarde contient trop de photos.");
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      if (!jpeg && !png) throw new Error("Signature de photo invalide.");
      const filename = `import-${hash}-${tag}-${index}.${png ? "png" : "jpg"}`;
      const previousPath = `${chantier}/${visite}/${key}/${p.filename}`;
      if (mapping.has(previousPath)) throw new Error("Plusieurs photos portent le même chemin dans cette copie.");
      mapping.set(previousPath, `${getSupabaseUrl()}/storage/v1/object/public/visite-photos/${chantier}/${visite}/${key}/${filename}`);
      return { id: `${id}:${tag}:photo:${index}`, chantier_id: chantier, visite_id: visite, reponse_key: key, filename, blob: new Blob([bytes], { type: png ? "image/png" : "image/jpeg" }) };
    });
    const responses = responsesInput.map((item, index): PendingResponse => {
      const r = object(item), visite = identifier(r.visite_id), point = identifier(r.point_controle_id);
      const urls = array(r.photos, 10).map(url => {
        if (typeof url !== "string") throw new Error("Référence de photo invalide.");
        const reference = referenceStockage(url);
        if (!reference || reference.bucket !== "visite-photos") throw new Error("La sauvegarde contient une photo extérieure au projet.");
        return mapping.get(reference.chemin) ?? url;
      });
      const content = { valeur: r.valeur as string, remarque: r.remarque as string | null, photos: urls };
      validateResponseContent(content); totalResponses++;
      if (totalResponses > 3000) throw new Error("La sauvegarde contient trop de saisies.");
      const key = `${visite}:${point}`;
      return { ...content, key, visite_id: visite, point_controle_id: point, revision: crypto.randomUUID(), synced: 0,
        updated_at: typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString(),
        editor_id: `${id}:${tag}:${index}`, recovery_key: `${key}:${id}:${tag}:${index}`, local_conflict: true,
        // Toute réimportation demande une comparaison explicite, même si le fichier annonce une base.
        base_revision: undefined, ancestors: [] };
    });
    return { photos, responses };
  };
  const active = group([...array(raw.responses, 3000), ...array(raw.recovery, 3000)], array(raw.photos, 1000), "active");
  const copies = array(raw.copies ?? [], 1000).map((item, index): SavedResolution => {
    const copy = object(item), content = group(array(copy.responses, 3000), array(copy.photos, 1000), `copy${index}`);
    return { id: `${id}:copy:${index}`, created_at: typeof copy.created_at === "string" ? copy.created_at : new Date().toISOString(), kind: "import", ...content };
  });
  assertOfflineScope(scope);
  return { id, userId: scope.userId, entrepriseId: scope.entrepriseId, ...active, copies };
}
export async function applyBackupImport(scope: OfflineScope, prepared: PreparedImport): Promise<boolean> {
  assertOfflineScope(scope);
  if (prepared.userId !== scope.userId || prepared.entrepriseId !== scope.entrepriseId) throw new Error("Le compte a changé depuis la lecture du fichier.");
  return storeImportedDrafts(scope, prepared.id, prepared.responses, prepared.photos, prepared.copies);
}
