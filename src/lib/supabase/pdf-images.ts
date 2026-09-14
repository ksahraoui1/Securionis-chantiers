import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { referenceStockage } from "@/lib/utils/storage-reference";

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_IMAGES = 200;

export class ImagePdfInvalide extends Error {}

/** Le moteur PDF reçoit seulement des octets, jamais une URL issue de la base. */
export function creerChargeurImagesPdf(supabase: SupabaseClient, empreintes?: ReadonlyMap<string, string>) {
  let total = 0;
  let nombre = 0;
  return async (url: string | null | undefined, bucket: "rapports" | "visite-photos"): Promise<string | null> => {
    if (!url) return null;
    const reference = referenceStockage(url);
    if (!reference || reference.bucket !== bucket) throw new ImagePdfInvalide("Image hors du stockage autorisé.");
    if (++nombre > MAX_IMAGES) throw new ImagePdfInvalide("Trop d’images pour ce rapport (maximum 200).");
    // Le SDK construit l'URL à partir du projet configuré. Pas de redirection
    // vers un autre serveur, même si le service distant en renvoie une.
    const parametres = { signal: AbortSignal.timeout(15_000), redirect: "error" as const };
    const { data, error } = await supabase.storage.from(bucket)
      .download(reference.chemin, {}, parametres).asStream();
    if (error || !data) throw new ImagePdfInvalide("Une image est inaccessible. Vérifiez vos droits et réessayez.");
    const lecteur = data.getReader();
    const morceaux: Uint8Array[] = [];
    let taille = 0;
    try {
      while (true) {
        const { value, done } = await lecteur.read();
        if (done) break;
        taille += value.byteLength;
        total += value.byteLength;
        if (taille > MAX_IMAGE || total > MAX_TOTAL) {
          throw new ImagePdfInvalide("Images trop volumineuses pour ce rapport (10 Mo par image, 40 Mo au total).");
        }
        morceaux.push(value);
      }
    } finally {
      try { await lecteur.cancel(); } catch { /* Flux déjà fermé ou interrompu. */ }
      lecteur.releaseLock();
    }
    const octets = Buffer.concat(morceaux);
    if (empreintes) {
      const attendue = empreintes.get(`${bucket}/${reference.chemin}`);
      if (!attendue || createHash("sha256").update(octets).digest("hex") !== attendue) throw new ImagePdfInvalide("L’intégrité d’une image archivée ne peut pas être confirmée.");
    }
    const png = octets.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff;
    if (!png && !jpeg) throw new ImagePdfInvalide("Seules les images PNG et JPEG sont admises dans le rapport.");
    return `data:image/${png ? "png" : "jpeg"};base64,${octets.toString("base64")}`;
  };
}
