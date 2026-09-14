export type DemandeAvenant = {
  id: string; visiteId: string; auteurId: string; archiveId: string;
  rapportReference: string; precedentId: string | null; objet: string; motif: string; contenu: string;
};
export type Avenant = {
  id: string; visite_id: string; archive_id: string; archive_sha256: string;
  numero: number; precedent_id: string | null; auteur_id: string; auteur_nom: string;
  objet: string; motif: string; contenu: string; rapport_reference: string;
  storage_path: string; sha256: string; valide_le: string; created_at: string;
};
export type PlanAvenant = Omit<Avenant, "storage_path" | "sha256" | "created_at"> & { date_visite: string; chantier_adresse: string; archive_mode: string };
export function validerDemandeAvenant(input: unknown): DemandeAvenant {
  if (!input || typeof input !== "object") throw new Error("Avenant incomplet.");
  const d = input as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const field of ["id", "visiteId", "auteurId", "archiveId"]) if (typeof d[field] !== "string" || !uuid.test(d[field])) throw new Error("Identifiant d’avenant invalide.");
  if (d.precedentId !== null && (typeof d.precedentId !== "string" || !uuid.test(d.precedentId))) throw new Error("Historique d’avenants invalide.");
  if (typeof d.rapportReference !== "string" || d.rapportReference.length === 0 || d.rapportReference.length > 2048) throw new Error("Rapport de référence requis.");
  const result = { ...d };
  for (const [field, min, max] of [["objet",5,200],["motif",5,1000],["contenu",20,20000]] as const) {
    if (typeof d[field] !== "string") throw new Error("Avenant incomplet.");
    const value = d[field].trim();
    if (value.length < min || value.length > max) throw new Error(`${field === "objet" ? "L’objet" : field === "motif" ? "Le motif" : "Le contenu"} doit contenir entre ${min} et ${max} caractères.`);
    result[field] = value;
  }
  return result as DemandeAvenant;
}
