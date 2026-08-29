/**
 * Géométrie des deux calques superposés — **logique pure**.
 *
 * Ce module ne connaît ni React ni OpenSeadragon : il décide *quoi* appliquer,
 * `useGeometrieCalques` se charge de l'appliquer. Cette séparation n'est pas
 * cosmétique — c'est ici que se sont concentrés les pièges du module de
 * comparaison (`setWidth` qui conserve le coin supérieur gauche, `setRotation`
 * qui pivote au centre, l'ordre largeur/position/rotation), et ils n'étaient
 * jusqu'ici vérifiables qu'à l'œil, dans un navigateur.
 */

export interface Point {
  x: number;
  y: number;
}

export interface EtatGeometrie {
  /** Les calques sont-ils échangés ? */
  inverse: boolean;
  /** Vue côte à côte plutôt que superposition. */
  split: boolean;
  /** Opacités en pourcentage, 0 à 100. */
  opacitePE: number;
  opaciteEXE: number;
  /** Décalage du calque du dessus, en unités monde. */
  decalage: Point;
  /** Largeur du calque du dessus, 1 = même largeur que celui du dessous. */
  echelleCalque: number;
  /** Rotation du calque du dessus, en degrés. */
  rotationCalque: number;
}

/** Ce qu'il faut appliquer à un calque. */
export interface ReglagesCalque {
  opacite: number;
  /**
   * Largeur à poser, ou `null` pour **ne pas y toucher**.
   *
   * ⚠️ La vue côte à côte laisse la largeur telle quelle. Ce n'est
   * probablement pas voulu — un calque réduit à 60 % y reste réduit alors que
   * le recalage n'a plus de sens — mais c'est le comportement d'origine, et un
   * refactoring ne le corrige pas en douce. Voir la note en tête de
   * `calculerOperations`.
   */
  largeur: number | null;
  position: Point;
  rotation: number;
}

export interface OperationsCalques {
  /** Quel plan va dessous, lequel va dessus. */
  dessous: "pe" | "exe";
  dessus: "pe" | "exe";
  pe: ReglagesCalque;
  exe: ReglagesCalque;
}

/** Écart horizontal entre les deux plans en vue côte à côte, en unités monde. */
export const ECART_COTE_A_COTE = 1.05;

export const ECHELLE_MIN = 0.25;
export const ECHELLE_MAX = 4;
export const ROTATION_MAX = 180;

/**
 * Traduit l'état de l'interface en réglages concrets pour les deux calques.
 *
 * En vue côte à côte, les deux plans sont pleinement visibles : l'opacité n'a
 * plus de sens et le recalage non plus, donc opacités et rotations sont remises
 * à plat et le calque du dessus est simplement décalé sur la droite.
 *
 * ⚠️ **L'échelle, elle, n'est pas remise à 1** (`largeur: null`). C'est le
 * comportement d'origine, conservé tel quel : un calque réduit à 60 % reste
 * réduit en vue côte à côte. Cela ressemble à un oubli plus qu'à une décision,
 * mais le corriger relèverait d'un changement de comportement, pas d'un
 * refactoring.
 */
export function calculerOperations(etat: EtatGeometrie): OperationsCalques {
  const dessus = etat.inverse ? "pe" : "exe";
  const dessous = etat.inverse ? "exe" : "pe";

  if (etat.split) {
    // `largeur: null` — l'échelle du calque n'est pas remise à 1 ici, fidèle
    // au comportement d'origine.
    const plat = (position: Point): ReglagesCalque => ({
      opacite: 1,
      largeur: null,
      position,
      rotation: 0,
    });
    const reglages = {
      [dessous]: plat({ x: 0, y: 0 }),
      [dessus]: plat({ x: ECART_COTE_A_COTE, y: 0 }),
    } as Record<"pe" | "exe", ReglagesCalque>;
    return { dessous, dessus, pe: reglages.pe, exe: reglages.exe };
  }

  const opacites = { pe: etat.opacitePE / 100, exe: etat.opaciteEXE / 100 };
  const reglages = {
    [dessous]: {
      opacite: opacites[dessous],
      largeur: 1,
      position: { x: 0, y: 0 },
      rotation: 0,
    },
    [dessus]: {
      opacite: opacites[dessus],
      largeur: etat.echelleCalque,
      position: { x: etat.decalage.x, y: etat.decalage.y },
      rotation: etat.rotationCalque,
    },
  } as Record<"pe" | "exe", ReglagesCalque>;

  return { dessous, dessus, pe: reglages.pe, exe: reglages.exe };
}

/** Ramène une échelle dans les bornes de l'interface. */
export function bornerEchelle(valeur: number): number {
  return Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, valeur));
}

/**
 * Ramène une rotation dans [-180, 180] et l'arrondit au dixième de degré.
 *
 * L'arrondi n'est pas cosmétique : sans lui, additionner des pas de 0,1 laisse
 * traîner des `0,30000000000000004` dans l'affichage.
 */
export function bornerRotation(degres: number): number {
  const borne = Math.min(ROTATION_MAX, Math.max(-ROTATION_MAX, degres));
  return Math.round(borne * 10) / 10;
}

/**
 * Nouveau décalage du calque après un changement d'échelle, de sorte que le
 * point situé au centre de la vue y reste.
 *
 * ⚠️ Sans ce recentrage, `setWidth` conserverait le coin supérieur gauche du
 * calque : ce qu'on regarde s'échapperait du cadre à chaque cran, et il
 * faudrait redéplacer le calque après chaque changement d'échelle.
 */
export function decalageApresEchelle(
  centreVue: Point,
  decalage: Point,
  echelleActuelle: number,
  echelleVoulue: number
): Point {
  if (echelleActuelle <= 0) return decalage;
  const rapport = echelleVoulue / echelleActuelle;
  return {
    x: centreVue.x - (centreVue.x - decalage.x) * rapport,
    y: centreVue.y - (centreVue.y - decalage.y) * rapport,
  };
}
