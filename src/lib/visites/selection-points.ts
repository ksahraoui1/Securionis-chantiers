/**
 * Sélection des points de contrôle d'une visite — logique pure, sans React.
 *
 * Le référentiel compte presque un thème par point (450 thèmes pour 499
 * points) : choisir des thèmes revenait à choisir des points une seconde fois.
 * On choisit donc directement les points, filtrés par famille et par recherche,
 * et les thèmes et catégories de la visite se déduisent de la sélection.
 */

import { FAMILLES, familleDeCategorie, type Famille } from "@/lib/utils/familles";

export interface PointSelectionnable {
  id: string;
  intitule: string;
  famille: string | null;
  categorie_id: string | null;
  theme_id: string | null;
  base_legale: string | null;
  mots_cles: string[] | null;
  is_custom?: boolean;
  categories: { libelle: string } | null;
  themes: { libelle: string } | null;
}

export interface GroupeCategorie {
  categorieId: string;
  libelle: string;
  famille: Famille;
  points: PointSelectionnable[];
}

/** Minuscules sans accents : « Échafaudage » et « echafaudage » se rejoignent. */
export function normaliser(texte: string | null | undefined): string {
  return (texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function familleDuPoint(point: PointSelectionnable): Famille {
  const declaree = FAMILLES.find((f) => f === point.famille);
  return declaree ?? familleDeCategorie(point.categories?.libelle);
}

function texteRecherche(point: PointSelectionnable): string {
  return normaliser(
    [
      point.intitule,
      point.base_legale,
      point.themes?.libelle,
      point.categories?.libelle,
      ...(point.mots_cles ?? []),
    ].join(" "),
  );
}

/**
 * Tous les mots saisis doivent figurer (ET), chacun comme début de mot : sur
 * le terrain on tape « garde corps echa », pas une phrase.
 */
export function correspond(point: PointSelectionnable, recherche: string): boolean {
  const mots = normaliser(recherche).split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 0);
  if (mots.length === 0) return true;
  const texte = " " + texteRecherche(point).replace(/[^\p{L}\p{N}]+/gu, " ");
  return mots.every((m) => texte.includes(" " + m));
}

export type FiltrePoints =
  | { type: "tous" }
  | { type: "famille"; famille: Famille }
  | { type: "categories"; ids: string[] }
  | { type: "selection"; ids: ReadonlySet<string> };

export function filtrerPoints(
  points: PointSelectionnable[],
  filtre: FiltrePoints,
  recherche: string,
): PointSelectionnable[] {
  return points.filter((p) => {
    if (filtre.type === "famille" && familleDuPoint(p) !== filtre.famille) return false;
    if (filtre.type === "categories" && !filtre.ids.includes(p.categorie_id ?? "")) return false;
    if (filtre.type === "selection" && !filtre.ids.has(p.id)) return false;
    return correspond(p, recherche);
  });
}

/** Groupes par catégorie, dans l'ordre des familles puis des libellés. */
export function grouperParCategorie(points: PointSelectionnable[]): GroupeCategorie[] {
  const groupes = new Map<string, GroupeCategorie>();
  for (const p of points) {
    const id = p.categorie_id ?? "sans-categorie";
    let g = groupes.get(id);
    if (!g) {
      g = {
        categorieId: id,
        libelle: p.categories?.libelle ?? "Sans catégorie",
        famille: familleDuPoint(p),
        points: [],
      };
      groupes.set(id, g);
    }
    g.points.push(p);
  }
  const rang = (f: Famille) => FAMILLES.indexOf(f);
  return [...groupes.values()]
    .sort((a, b) => rang(a.famille) - rang(b.famille) || a.libelle.localeCompare(b.libelle, "fr"))
    .map((g) => ({
      ...g,
      points: [...g.points].sort((a, b) => a.intitule.localeCompare(b.intitule, "fr")),
    }));
}

/** Nombre de points par famille, pour les pastilles. */
export function compterParFamille(points: PointSelectionnable[]): Map<Famille, number> {
  const compte = new Map<Famille, number>();
  for (const p of points) {
    const f = familleDuPoint(p);
    compte.set(f, (compte.get(f) ?? 0) + 1);
  }
  return compte;
}

/** Thèmes et catégories distincts d'une sélection, dans l'ordre d'apparition. */
export function deduireRattachements(points: PointSelectionnable[]): {
  themeIds: string[];
  categorieIds: string[];
} {
  const themes = new Set<string>();
  const categories = new Set<string>();
  for (const p of points) {
    if (p.theme_id) themes.add(p.theme_id);
    if (p.categorie_id) categories.add(p.categorie_id);
  }
  return { themeIds: [...themes], categorieIds: [...categories] };
}
