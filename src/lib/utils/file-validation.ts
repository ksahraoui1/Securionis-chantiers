/**
 * Validation centralisée des fichiers uploadés.
 * Whitelist stricte des extensions et types MIME autorisés.
 */

const ALLOWED_DOCUMENT_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png",
];

const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"];

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
};

const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50 Mo
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 Mo
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 Mo

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedExtension?: string;
}

/**
 * Valide un fichier document (PDF, Word, Excel, images).
 */
export function validateDocumentFile(file: File): FileValidationResult {
  return validateFile(file, ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE);
}

/**
 * Valide un fichier image (JPG, PNG uniquement — pas de SVG).
 */
export function validateImageFile(file: File): FileValidationResult {
  return validateFile(file, ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGE_SIZE);
}

/**
 * Valide un logo (JPG, PNG uniquement — pas de SVG).
 */
export function validateLogoFile(file: File): FileValidationResult {
  return validateFile(file, ALLOWED_IMAGE_EXTENSIONS, MAX_LOGO_SIZE);
}

function validateFile(
  file: File,
  allowedExtensions: string[],
  maxSize: number
): FileValidationResult {
  // Vérifier la taille
  if (file.size > maxSize) {
    const maxMo = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `Le fichier dépasse ${maxMo} Mo` };
  }

  if (file.size === 0) {
    return { valid: false, error: "Le fichier est vide" };
  }

  // Extraire et vérifier l'extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Extension non autorisée. Formats acceptés : ${allowedExtensions.join(", ")}`,
    };
  }

  // Vérifier le type MIME
  const allowedMimes = ALLOWED_MIME_TYPES[ext];
  if (allowedMimes && file.type && !allowedMimes.includes(file.type)) {
    // Tolérer application/octet-stream (certains navigateurs)
    if (file.type !== "application/octet-stream") {
      return {
        valid: false,
        error: `Type de fichier invalide pour l'extension .${ext}`,
      };
    }
  }

  return { valid: true, sanitizedExtension: ext };
}

/**
 * Extrait une extension sûre d'un nom de fichier.
 * Retourne uniquement des extensions de la whitelist.
 */
export function getSafeExtension(filename: string, allowedExtensions: string[] = ALLOWED_DOCUMENT_EXTENSIONS): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return allowedExtensions.includes(ext) ? ext : "bin";
}
