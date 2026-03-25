export const VALEURS_REPONSE = {
  CONFORME: "conforme",
  NON_CONFORME: "non_conforme",
  PAS_NECESSAIRE: "pas_necessaire",
} as const;

export const LABELS_REPONSE: Record<string, string> = {
  conforme: "Conforme",
  non_conforme: "Non-conforme",
  pas_necessaire: "Pas nécessaire",
};

export const STATUTS_VISITE = {
  BROUILLON: "brouillon",
  EN_COURS: "en_cours",
  TERMINEE: "terminee",
} as const;

export const LABELS_STATUT_VISITE: Record<string, string> = {
  brouillon: "Brouillon",
  en_cours: "En cours",
  terminee: "Terminée",
};

export const STATUTS_ECART = {
  OUVERT: "ouvert",
  EN_COURS_CORRECTION: "en_cours_correction",
  CORRIGE: "corrige",
} as const;

export const LABELS_STATUT_ECART: Record<string, string> = {
  ouvert: "Ouvert",
  en_cours_correction: "En cours de correction",
  corrige: "Corrigé",
};

export const MAX_PHOTOS = 10;
export const MAX_PHOTO_SIZE_MB = 10;
export const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;
export const PHOTO_MAX_DIMENSION = 1920;
export const PHOTO_QUALITY = 0.8;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/heic"];

export const AUTOSAVE_DEBOUNCE_MS = 2000;

export const SESSION_DURATION_DAYS = 7;

/**
 * Nettoie le formatage markdown d'un texte pour obtenir du texte brut lisible.
 * Supprime : **gras**, *italique*, ##titres, ```blocs```, `code`, - puces md
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    // Blocs de code
    .replace(/```[\s\S]*?```/g, "")
    // Titres ### ## #
    .replace(/^#{1,6}\s+/gm, "")
    // Gras **texte** ou __texte__
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    // Italique *texte* ou _texte_
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    // Code inline `texte`
    .replace(/`([^`]+)`/g, "$1")
    // Puces markdown "- texte" → "- texte" (garder le tiret simple)
    .replace(/^\*\s+/gm, "- ")
    // Liens [texte](url) → texte
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Lignes horizontales ---
    .replace(/^-{3,}$/gm, "")
    // Espaces multiples
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
