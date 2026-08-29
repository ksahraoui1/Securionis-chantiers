import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * URL signées pour les buckets privés (SEC-03).
 *
 * Les buckets `rapports` et `visite-photos` sont privés depuis la migration
 * 048. Les URL stockées en base restent celles de la forme publique — elles
 * n'y sont plus qu'un **identifiant** : ce module les retraduit en URL signées
 * au moment de la lecture. Aucune migration de données n'a donc été nécessaire.
 *
 * ⚠️ Une URL signée expire. Elle se demande au moment du rendu, jamais à
 * l'écriture, et ne doit jamais être écrite en base : une URL d'une heure
 * enregistrée dans `documents.fichier_url` serait morte le lendemain.
 */

/** Durée de validité par défaut. Large : une visite de chantier dure longtemps. */
export const DUREE_SIGNATURE_S = 60 * 60 * 4;

/**
 * Découpe une URL Supabase Storage en `{ bucket, chemin }`.
 *
 * Accepte les deux formes rencontrées en base — `/object/public/<bucket>/…`
 * (héritée de l'époque des buckets publics) et `/object/sign/<bucket>/…`.
 * Retourne `null` pour tout ce qui n'est pas une URL de stockage, ce qui laisse
 * passer sans transformation les valeurs déjà signées ou étrangères.
 */
export function decomposerUrlStockage(
  url: string,
): { bucket: string; chemin: string } | null {
  const marqueur = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (!marqueur) return null;

  const bucket = marqueur[1];
  // La forme signée porte déjà un `?token=…` : on le retire du chemin.
  const chemin = decodeURIComponent(marqueur[2].split("?")[0]);

  // Garde anti path-traversal, comme `extractStoragePath`.
  if (chemin.includes("..") || chemin.startsWith("/")) return null;

  return { bucket, chemin };
}

/**
 * Signe une URL de stockage. Renvoie l'URL d'origine si elle n'en est pas une,
 * et `null` si la signature échoue — au caller de décider quoi afficher.
 */
export async function signerUrl(
  supabase: SupabaseClient,
  url: string | null | undefined,
  dureeS: number = DUREE_SIGNATURE_S,
): Promise<string | null> {
  if (!url) return null;

  const piece = decomposerUrlStockage(url);
  if (!piece) return url;

  const { data, error } = await supabase.storage
    .from(piece.bucket)
    .createSignedUrl(piece.chemin, dureeS);

  if (error || !data?.signedUrl) {
    console.error(`[stockage] Signature impossible (${piece.bucket}/${piece.chemin}) :`, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Signe un lot d'URL. Regroupe par bucket et n'émet qu'un appel par bucket
 * (`createSignedUrls`), au lieu d'un aller-retour par fichier — une visite peut
 * porter des dizaines de photos.
 *
 * Conserve l'ordre et la longueur du tableau d'entrée ; une entrée qui n'a pas
 * pu être signée vaut `null`.
 */
export async function signerUrls(
  supabase: SupabaseClient,
  urls: (string | null | undefined)[],
  dureeS: number = DUREE_SIGNATURE_S,
): Promise<(string | null)[]> {
  const resultat: (string | null)[] = urls.map((u) => u ?? null);

  // bucket → [{ index, chemin }]
  const parBucket = new Map<string, { index: number; chemin: string }[]>();

  urls.forEach((url, index) => {
    if (!url) return;
    const piece = decomposerUrlStockage(url);
    if (!piece) return; // valeur étrangère : laissée telle quelle
    const liste = parBucket.get(piece.bucket) ?? [];
    liste.push({ index, chemin: piece.chemin });
    parBucket.set(piece.bucket, liste);
  });

  await Promise.all(
    [...parBucket.entries()].map(async ([bucket, entrees]) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(entrees.map((e) => e.chemin), dureeS);

      if (error || !data) {
        console.error(`[stockage] Signature de lot impossible (${bucket}) :`, error?.message);
        entrees.forEach((e) => (resultat[e.index] = null));
        return;
      }

      // `createSignedUrls` renvoie les résultats dans l'ordre des chemins demandés.
      data.forEach((item, i) => {
        const cible = entrees[i];
        if (!cible) return;
        resultat[cible.index] = item.signedUrl ?? null;
      });
    }),
  );

  return resultat;
}

/**
 * Repasse une URL signée à sa forme canonique `/object/public/<bucket>/<chemin>`.
 *
 * ⚠️ Indispensable avant toute **écriture** en base. Les photos d'une visite
 * font un aller-retour par le navigateur : servies signées pour l'affichage,
 * elles reviennent telles quelles dans le tableau `reponses.photos` au prochain
 * enregistrement. Sans cette normalisation, la base se remplirait d'URL mortes
 * au bout de quelques heures — et le mal ne se verrait que le lendemain.
 *
 * Sans effet sur une URL déjà canonique ou étrangère.
 */
export function canoniserUrlStockage(url: string): string {
  const piece = decomposerUrlStockage(url);
  if (!piece) return url;
  const base = url.slice(0, url.indexOf("/storage/v1/object/"));
  return `${base}/storage/v1/object/public/${piece.bucket}/${piece.chemin}`;
}

/** Variante tableau, pour `reponses.photos`. */
export function canoniserUrlsStockage(urls: string[]): string[] {
  return urls.map(canoniserUrlStockage);
}
