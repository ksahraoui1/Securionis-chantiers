/**
 * Validation centralisée des fichiers uploadés.
 * Whitelist stricte des extensions et types MIME autorisés.
 */

const ALLOWED_DOCUMENT_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png",
];

const ALLOWED_PDF_OR_IMAGE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];

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
 * Valide un fichier PDF ou image (JPG/PNG) — 50 Mo max.
 * Utilisé pour la base documentaire et les pièces jointes des points de contrôle.
 */
export function validatePdfOrImageFile(file: File): FileValidationResult {
  return validateFile(file, ALLOWED_PDF_OR_IMAGE_EXTENSIONS, MAX_DOCUMENT_SIZE);
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
 * Vérifie la signature binaire réelle (magic bytes) d'un fichier.
 * Défense en profondeur contre les fichiers dont l'extension/MIME déclaré
 * ne correspond pas au contenu réel. Le contrôle autoritaire reste la
 * configuration `allowed_mime_types` des buckets Supabase Storage.
 *
 * Retourne null si valide, un message d'erreur sinon.
 */
export async function validateFileSignature(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  const startsWith = (sig: number[]) =>
    sig.every((byte, i) => header[i] === byte);

  switch (ext) {
    case "pdf":
      // %PDF
      return startsWith([0x25, 0x50, 0x44, 0x46]) ? null : "Le contenu du fichier ne correspond pas à un PDF";
    case "png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]) ? null : "Le contenu du fichier ne correspond pas à un PNG";
    case "jpg":
    case "jpeg":
      return startsWith([0xff, 0xd8, 0xff]) ? null : "Le contenu du fichier ne correspond pas à un JPEG";
    case "docx":
    case "xlsx":
      // Conteneur ZIP (PK..)
      return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])
        ? null
        : "Le contenu du fichier ne correspond pas au format Office attendu";
    case "doc":
    case "xls":
      // Conteneur OLE2
      return startsWith([0xd0, 0xcf, 0x11, 0xe0]) ? null : "Le contenu du fichier ne correspond pas au format Office attendu";
    default:
      return null;
  }
}

/**
 * Extrait une extension sûre d'un nom de fichier.
 * Retourne uniquement des extensions de la whitelist.
 */
export function getSafeExtension(filename: string, allowedExtensions: string[] = ALLOWED_DOCUMENT_EXTENSIONS): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return allowedExtensions.includes(ext) ? ext : "bin";
}
