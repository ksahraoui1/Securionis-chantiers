/**
 * Génération des mots-clés d'un point de contrôle (colonne `mots_cles`).
 *
 * Miroir applicatif de la migration 035 : mêmes règles (mots d'au moins
 * 4 caractères, hors mots vides, dédoublonnés et triés) afin que les points
 * créés depuis l'admin soient indexés comme ceux importés.
 */

const MOTS_VIDES = new Set([
  "avec", "dans", "pour", "sont", "sans", "sous", "être", "etre", "doit", "doivent",
  "peut", "peuvent", "plus", "tout", "tous", "toute", "toutes", "cette", "ces",
  "leur", "leurs", "elle", "elles", "autre", "autres", "ainsi", "afin", "alors",
  "lors", "lorsque", "selon", "comme", "entre", "contre", "chaque", "quand",
  "aussi", "très", "tres", "même", "meme", "celui", "celle", "dont",
]);

/** Mots-clés dédoublonnés et triés issus des textes fournis (intitulé, thème, catégorie...). */
export function genererMotsCles(...textes: (string | null | undefined)[]): string[] {
  const mots = textes
    .filter((t): t is string => Boolean(t))
    .join(" ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));

  return [...new Set(mots)].sort();
}
