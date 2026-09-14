export const MAX_PIECES_PREUVE = 5;
export const MAX_TAILLE_PREUVE = 5 * 1024 * 1024;
export interface PieceEcart {
  id: string;
  nom: string;
  mime: string;
  taille: number;
  sha256: string;
  revision_preparation: number;
}
export function validerNomPreuve(nom: string): void {
  if (!nom || nom.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(nom) || !/\.(pdf|png|jpe?g)$/i.test(nom)) {
    throw new Error("Choisissez un PDF, JPEG ou PNG avec un nom de 180 caractères maximum.");
  }
}
export function validerFichierPreuve(file: File): void {
  validerNomPreuve(file.name);
  if (!file.size || file.size > MAX_TAILLE_PREUVE) throw new Error("Chaque pièce doit contenir entre 1 octet et 5 Mo.");
}
