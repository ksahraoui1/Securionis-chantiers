import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { readOfflineBackup, type PendingPhoto } from "@/lib/offline/db";

/** Copie locale volontaire : aucun envoi réseau, aucune suppression de la file. */
export async function createOfflineBackup(scope: OfflineScope, copyId?: string): Promise<Blob> {
  let backup = await readOfflineBackup(scope);
  if (copyId) {
    const copy = backup.copies.find(c => c.id === copyId);
    if (!copy) throw new Error("Copie introuvable");
    backup = { ...backup, responses: copy.responses, recovery: [], photos: copy.photos, copies: [] };
  }
  const serialize = async (items: PendingPhoto[]) => Promise.all(items.map(async ({ blob, ...photo }) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { ...photo, mime_type: blob.type, base64: btoa(binary) };
  }));
  const photos = await serialize(backup.photos);
  const copies = await Promise.all(backup.copies.map(async copy => ({ ...copy, photos: await serialize(copy.photos) })));
  assertOfflineScope(scope);
  return new Blob([JSON.stringify({ ...backup, photos, copies }, null, 2)], { type: "application/json" });
}
