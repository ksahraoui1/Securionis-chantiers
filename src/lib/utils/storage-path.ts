/**
 * Helpers pour construire et extraire des chemins Supabase Storage,
 * avec garde anti path-traversal côté extraction.
 */

export function buildStoragePath(prefix: string, ext: string): string {
  return `${prefix}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Extrait un chemin sûr depuis une URL publique Supabase Storage.
 * Bloque les tentatives de path-traversal (".." ou path absolu).
 * Retourne null si l'URL ne contient pas le bucket attendu ou si le chemin est suspect.
 */
export function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  // Retirer la chaîne de requête : une URL signée porte `?token=…`, qui ne
  // fait pas partie du chemin de stockage. Sans cela, une suppression viserait
  // un objet inexistant — et Supabase ne s'en plaint pas.
  const path = url.substring(idx + marker.length).split("?")[0];
  if (path.includes("..") || path.startsWith("/")) return null;
  return decodeURIComponent(path);
}
