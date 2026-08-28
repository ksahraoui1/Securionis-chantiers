import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEX_COULEURS,
  LIBELLES_COULEUR,
  LIBELLES_TYPE,
  type CouleurAnnotation,
  type TypeAnnotation,
} from "@/lib/utils/comparaison-libelles";

/**
 * Chargement des données d'une comparaison de plans, côté serveur.
 * Partagé par la génération du rapport PDF et le partage par email.
 */

// La capture est produite par le navigateur : elle est bornée côté serveur.
export const TAILLE_MAX_CAPTURE = 20 * 1024 * 1024;

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface AnnotationRapport {
  numero: number;
  type: string;
  couleur: string;
  hex: string;
  commentaire: string | null;
  numeroNC: number | null;
}

export interface PlanRapport {
  id: string;
  nom: string;
  version: number | null;
  date: string;
  page: number;
}

export interface DonneesComparaison {
  chantierId: string;
  chantierNom: string;
  chantierAdresse: string | null;
  planPE: PlanRapport;
  planEXE: PlanRapport;
  annotations: AnnotationRapport[];
  signePar: string;
  entrepriseNom: string | null;
}

function formaterDate(valeur: string | null): string {
  if (!valeur) return "—";
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-CH");
}

/**
 * Lit et valide la capture PNG envoyée par le navigateur.
 * Le type MIME annoncé ne suffit pas : la signature du fichier est vérifiée.
 */
export async function lireCapturePng(
  fichier: FormDataEntryValue | null
): Promise<{ buffer: Buffer } | { erreur: string }> {
  if (!fichier || typeof fichier === "string") {
    return { erreur: "Capture de la vue manquante." };
  }
  if (fichier.size === 0) {
    return { erreur: "Capture de la vue vide." };
  }
  if (fichier.size > TAILLE_MAX_CAPTURE) {
    return { erreur: "Capture de la vue trop volumineuse." };
  }

  const buffer = Buffer.from(await fichier.arrayBuffer());
  const signature = SIGNATURE_PNG.every((octet, i) => buffer[i] === octet);
  if (!signature) {
    return { erreur: "La capture n'est pas une image PNG valide." };
  }

  return { buffer };
}

/**
 * Charge la comparaison, ses plans et ses annotations.
 * Le client passé doit être celui de l'utilisateur : la RLS fait la
 * vérification d'accès, doublée par `canAccessChantier` dans les routes.
 */
export async function chargerComparaison(
  supabase: SupabaseClient,
  comparaisonId: string,
  userId: string
): Promise<DonneesComparaison | null> {
  const { data: comparaison } = await supabase
    .from("comparaisons")
    .select("id, chantier_id, document_pe_id, document_exe_id, page_pe, page_exe")
    .eq("id", comparaisonId)
    .single();

  if (!comparaison) return null;

  const [{ data: chantier }, { data: documents }] = await Promise.all([
    supabase
      .from("chantiers")
      .select("id, nom, adresse")
      .eq("id", comparaison.chantier_id)
      .single(),
    supabase
      .from("documents")
      .select("id, nom, plan_version, updated_at")
      .in("id", [comparaison.document_pe_id, comparaison.document_exe_id]),
  ]);

  if (!chantier) return null;

  const parId = new Map((documents ?? []).map((d) => [d.id, d]));
  const brutPE = parId.get(comparaison.document_pe_id);
  const brutEXE = parId.get(comparaison.document_exe_id);

  if (!brutPE || !brutEXE) return null;

  const { data: lignes } = await supabase
    .from("comparaison_annotations")
    .select("id, type, color, commentaire")
    .eq("comparaison_id", comparaisonId)
    .order("created_at");

  const idsAnnotations = (lignes ?? []).map((l) => l.id);
  let numerosNC: Record<string, number> = {};

  if (idsAnnotations.length > 0) {
    const { data: liens } = await supabase
      .from("comparaison_nc_links")
      .select("annotation_id, ecarts(numero)")
      .in("annotation_id", idsAnnotations);

    numerosNC = Object.fromEntries(
      (liens ?? [])
        .map((l) => [
          l.annotation_id,
          (l.ecarts as unknown as { numero: number } | null)?.numero ?? 0,
        ])
        .filter(([, numero]) => Number(numero) > 0)
    );
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("nom, entreprise_id")
    .eq("id", userId)
    .single();

  let entrepriseNom: string | null = null;
  if (profil?.entreprise_id) {
    const { data: entreprise } = await supabase
      .from("entreprises")
      .select("nom")
      .eq("id", profil.entreprise_id)
      .single();
    entrepriseNom = entreprise?.nom ?? null;
  }

  return {
    chantierId: chantier.id,
    chantierNom: chantier.nom || chantier.adresse,
    chantierAdresse: chantier.adresse ?? null,
    planPE: {
      id: brutPE.id,
      nom: brutPE.nom,
      version: brutPE.plan_version,
      date: formaterDate(brutPE.updated_at),
      page: comparaison.page_pe,
    },
    planEXE: {
      id: brutEXE.id,
      nom: brutEXE.nom,
      version: brutEXE.plan_version,
      date: formaterDate(brutEXE.updated_at),
      page: comparaison.page_exe,
    },
    annotations: (lignes ?? []).map((ligne, index) => {
      const couleur = ligne.color as CouleurAnnotation;
      const type = ligne.type as TypeAnnotation;
      return {
        numero: index + 1,
        type: LIBELLES_TYPE[type] ?? type,
        couleur: LIBELLES_COULEUR[couleur] ?? couleur,
        hex: HEX_COULEURS[couleur] ?? "#6b7280",
        commentaire: ligne.commentaire,
        numeroNC: numerosNC[ligne.id] ?? null,
      };
    }),
    signePar: profil?.nom?.trim() || "Utilisateur",
    entrepriseNom,
  };
}

/** Nom de fichier attendu pour un export de comparaison. */
export function nomFichierComparaison(
  donnees: DonneesComparaison,
  extension: "png" | "pdf"
): string {
  const chantier = assainir(donnees.chantierNom);
  const jour = dateFichier();
  if (extension === "pdf") {
    return `Rapport_comparaison_${chantier}_${jour}.pdf`;
  }
  const pe = donnees.planPE.version ?? 0;
  const exe = donnees.planEXE.version ?? 0;
  return `Comparaison_${chantier}_PE_V${pe}_EXE_V${exe}_${jour}.png`;
}

function assainir(valeur: string): string {
  return (
    valeur
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chantier"
  );
}

function dateFichier(date = new Date()): string {
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 10);
}
