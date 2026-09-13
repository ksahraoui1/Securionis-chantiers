import { getSupabaseUrl } from "@/lib/env";

/** Un identifiant Storage ne doit jamais pouvoir devenir une URL arbitraire. */
export function cheminStockageValide(chemin: string): boolean {
  return chemin.length > 0 && chemin.length <= 1024
    && !/[\\%?#\u0000-\u001f\u007f]/.test(chemin)
    && chemin.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function referenceStockage(url: string): { bucket: string; chemin: string } | null {
  try {
    // Vérifier avant new URL, qui normalise les segments de traversée.
    if (/[\\\u0000-\u0020\u007f]/.test(url)) return null;
    const origine = new URL(getSupabaseUrl());
    const parsed = new URL(url);
    if (parsed.origin !== origine.origin || parsed.protocol !== "https:"
      || parsed.username || parsed.password || parsed.hash) return null;
    const brut = url.split("?")[0];
    const match = brut.match(/\/storage\/v1\/object\/(?:public|sign)\/([a-z0-9-]+)\/(.+)$/);
    if (!match || !["rapports", "visite-photos"].includes(match[1])) return null;
    const chemin = decodeURIComponent(match[2]);
    if (!cheminStockageValide(chemin)) return null;
    return { bucket: match[1], chemin };
  } catch {
    return null;
  }
}

export function cheminRapportVisite(chantierId: string, visiteId: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(chantierId) || !uuid.test(visiteId)) throw new Error("Identifiant de visite invalide");
  return `${chantierId}/visites/${visiteId}/rapport.pdf`;
}

export function cheminVersionRapport(chantierId: string, visiteId: string, versionId: string): string {
  const base = cheminRapportVisite(chantierId, visiteId).replace(/rapport\.pdf$/, "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) {
    throw new Error("Identifiant de version invalide");
  }
  return `${base}versions/${versionId}.pdf`;
}

/** Les anciens rapports restent lisibles, uniquement dans leur visite attendue. */
export function verifierRapportVisite(
  reference: string,
  visite: { id: string; chantier_id: string; date_visite: string },
): string {
  const nouveau = cheminRapportVisite(visite.chantier_id, visite.id);
  const piece = referenceStockage(reference);
  const chemin = piece?.bucket === "rapports" ? piece.chemin : reference;
  const ancien = `${visite.chantier_id}/rapport_${visite.date_visite.replace(/-/g, "")}_${visite.id.slice(0, 8)}.pdf`;
  const prefixeVersion = nouveau.replace(/rapport\.pdf$/, "versions/");
  const version = chemin.startsWith(prefixeVersion) ? chemin.slice(prefixeVersion.length) : "";
  const estVersion = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(version);
  if (!cheminStockageValide(chemin) || (chemin !== nouveau && chemin !== ancien && !estVersion)) {
    throw new Error("Le fichier ne correspond pas à cette visite. Régénérez le rapport.");
  }
  return chemin;
}
