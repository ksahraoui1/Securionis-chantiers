import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
import { readOfflineBackup } from "@/lib/offline/db";

/** Copie locale volontaire : aucun envoi réseau, aucune suppression de la file. */
export async function createOfflineBackup(scope: OfflineScope): Promise<Blob> {
  const backup = await readOfflineBackup(scope);
  const photos = await Promise.all(backup.photos.map(async ({ blob, ...photo }) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { ...photo, mime_type: blob.type, base64: btoa(binary) };
  }));
  assertOfflineScope(scope);
  return new Blob([JSON.stringify({ ...backup, photos }, null, 2)], { type: "application/json" });
}
