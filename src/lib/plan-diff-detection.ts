/**
 * Détection des différences structurelles entre deux plans.
 *
 * ⚠️ Client uniquement (OpenCV.js).
 *
 * Pipeline complet : `analyserPlans()`. Les étapes sont exposées séparément
 * pour rester testables et réutilisables.
 */

import {
  chargerOpenCv,
  opencv,
  type Mat,
  type MatVector,
  type Rect,
} from "@/lib/opencv";
import {
  alignPlans,
  canevasDepuisImage,
  detecterCartouches,
  masqueHorsCartouches,
  echelleDepuisPaires,
  chargerImage,
  convertToGrayscale,
  libererTout,
  matDepuisImage,
  normalizeBrightness,
  resizeToSameDimensions,
} from "@/lib/plan-preprocessing";

/**
 * Rend la main au navigateur entre deux étapes.
 *
 * OpenCV.js est synchrone : sans ces respirations, tout le pipeline occupe le
 * thread principal d'un bloc, l'indicateur « Analyse en cours… » n'est jamais
 * peint et l'onglet paraît figé.
 */
function respirer(): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, 0));
}

export type TypeDifference = "added" | "removed" | "modified" | "moved";

export interface ZoneDifference {
  /** Coordonnées en pixels, dans le repère de l'image d'analyse (plan PE). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Aire du contour, en pixels. */
  area: number;
  /** Aire de la boîte rapportée à celle de l'image, entre 0 et 1. */
  aireRelative: number;
  /** Part de pixels encrés dans la zone, sur chaque plan (0 à 1). */
  encrePE: number;
  encreEXE: number;
  type: TypeDifference;
}

export interface ResultatAnalyse {
  zones: ZoneAvancee[];
  /**
   * Contours bruts avant tout filtrage. Un nombre énorme signale que le
   * recalage a laissé du liseré partout, donc un résultat peu fiable.
   */
  contours: number;
  /**
   * Part de la surface qui diffère après recalage, entre 0 et 1.
   * Au-delà de `DISCORDANCE_MAX`, les deux plans ne représentent pas la même
   * chose et le résultat n'a aucun sens.
   */
  discordance: number;
  /** Dimensions de l'image d'analyse : repère des coordonnées ci-dessus. */
  largeur: number;
  hauteur: number;
  /** Correspondances ORB retenues pour l'alignement. */
  correspondances: number;
  /** Faux si les plans n'ont pas pu être recalés l'un sur l'autre. */
  aligne: boolean;
  /** Rapport d'échelle estimé du plan EXE par rapport au plan PE. */
  echelle: ResultatEchelle;
  /** Motif du refus d'alignement, `null` quand l'analyse a abouti. */
  raison: string | null;
  /**
   * Cartouches écartés de la comparaison, dans le repère d'analyse.
   * Renvoyés pour être montrés : une exclusion invisible serait invérifiable.
   */
  cartouches: Rect[];
  /**
   * Conversion des coordonnées d'une zone vers les unités monde OpenSeadragon.
   * Elle rend le repère explicite, que l'analyse ait porté sur les plans
   * entiers ou sur la vue recalée à l'écran.
   */
  repere: RepereMonde;
  /**
   * Réserve sur la fiabilité du résultat, `null` s'il n'y en a pas.
   * Une discordance élevée ne fait plus échouer l'analyse quand l'utilisateur
   * a lui-même recalé les plans : c'est son jugement qui prime, on se contente
   * de signaler que le résultat sera bruité.
   */
  avertissement: string | null;
}

/**
 * Passage des pixels d'analyse aux unités monde OpenSeadragon, où le plan PE
 * fait 1 de large.
 *
 *     monde.x = origineX + pixel.x × unitesParPixel
 *     monde.y = origineY + pixel.y × unitesParPixel
 *
 * L'échelle étant isotrope, un seul facteur suffit pour les deux axes.
 */
export interface RepereMonde {
  origineX: number;
  origineY: number;
  unitesParPixel: number;
}

/** Résolution de travail : au-delà, le gain de finesse ne paie pas le temps. */
const LARGEUR_ANALYSE = 1600;

/** Écart d'intensité à partir duquel deux pixels diffèrent vraiment. */
const SEUIL_DIFFERENCE = 45;

/** En dessous de cette intensité, un pixel est considéré comme encré. */
const SEUIL_ENCRE = 165;

/** Ouverture : retire les points isolés. Fermeture : recolle un même trait. */
const NOYAU_OUVERTURE = 5;
const NOYAU_FERMETURE = 9;

/** Au-delà, la comparaison n'a plus de sens : les plans sont trop différents. */
const NB_ZONES_MAX = 500;

/**
 * Aire minimale d'une boîte, en pixels, pour qu'elle mérite d'être mesurée.
 *
 * Ce n'est pas le filtrage métier (`filterNoise`) mais un garde-fou de coût :
 * un recalage au sous-pixel près laisse un liseré le long de **chaque** trait
 * du plan, ce qui peut produire des dizaines de milliers de contours de
 * quelques pixels. Mesurer l'encre de chacun demande deux `roi()` et deux
 * `countNonZero()` — soit des centaines de milliers d'appels à travers Embind,
 * qui figent l'onglet pendant des minutes. Une boîte de moins de 40 px² est du
 * bruit sous n'importe quel réglage : on l'écarte avant de payer ce prix.
 */
const AIRE_MINIMALE_PX = 40;

/**
 * Nombre de contours examinés au maximum.
 * Au-delà, les deux plans n'ont visiblement rien à voir : inutile de
 * poursuivre, et le résultat serait de toute façon illisible.
 */
const NB_CONTOURS_MAX = 20_000;

/**
 * Part maximale de surface divergente au-delà de laquelle on refuse de
 * conclure. ORB trouve assez de correspondances fortuites entre deux pages
 * d'un même dossier — même cartouche, même cadre, mêmes hachures — pour
 * produire une homographie d'apparence plausible. Seul le résidu après
 * recalage distingue « deux versions du même plan » de « deux plans
 * différents ».
 */
const DISCORDANCE_MAX = 0.06;

/**
 * Au-delà, la comparaison n'a plus aucun sens et on refuse de conclure, même
 * si l'utilisateur a recalé les plans lui-même : à ce niveau, la différence
 * couvre l'essentiel de la surface et le résultat serait illisible.
 */
const DISCORDANCE_REFUS = 0.6;

/** Une zone est « encrée » à partir de cette proportion de pixels sombres. */
const ENCRE_SIGNIFICATIVE = 0.02;

/** Rapport d'encre à partir duquel un ajout ou une suppression est net. */
const FACTEUR_DOMINANCE = 1.8;

/**
 * Corrélation minimale pour reconnaître le même motif ailleurs dans le
 * voisinage — donc conclure à un déplacement plutôt qu'à une modification.
 */
const CORRELATION_DEPLACEMENT = 0.72;

/** Décalage minimal, en pixels, pour parler de déplacement et non de bruit. */
const DECALAGE_MINIMAL = 4;

/** Nombre de recherches de motif par analyse : chacune a un coût. */
const NB_RECHERCHES_DEPLACEMENT = 40;

/**
 * Détecte les différences structurelles entre deux plans alignés.
 *
 * Différence absolue → seuillage → ouverture puis fermeture morphologiques →
 * contours. Chaque zone repart avec la part d'encre mesurée sur chacun des
 * deux plans, ce qui permet à `classifyDiff()` de la qualifier.
 *
 * Les deux images doivent être en niveaux de gris, de même taille et alignées.
 */
export function detectStructuralDiffs(
  img1: Mat,
  img2: Mat
): { zones: ZoneDifference[]; contours: number; discordance: number } {
  const cv = opencv();

  const difference = new cv.Mat();
  const binaire = new cv.Mat();
  const nettoyee = new cv.Mat();
  const hierarchie = new cv.Mat();
  const contours = new cv.MatVector();
  let noyauOuverture: Mat | null = null;
  let noyauFermeture: Mat | null = null;

  // Masques d'encre calculés une fois pour toutes : les compter zone par zone
  // à partir des niveaux de gris coûterait un seuillage par zone.
  let encre1: Mat | null = null;
  let encre2: Mat | null = null;

  try {
    cv.absdiff(img1, img2, difference);

    // Un flou léger absorbe le résidu d'un alignement au pixel près, qui
    // sinon dessinerait un liseré le long de chaque trait.
    cv.GaussianBlur(difference, difference, new cv.Size(3, 3), 0);

    cv.threshold(
      difference,
      binaire,
      SEUIL_DIFFERENCE,
      255,
      cv.THRESH_BINARY
    );

    noyauOuverture = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(NOYAU_OUVERTURE, NOYAU_OUVERTURE)
    );
    noyauFermeture = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(NOYAU_FERMETURE, NOYAU_FERMETURE)
    );

    cv.morphologyEx(binaire, nettoyee, cv.MORPH_OPEN, noyauOuverture);
    cv.morphologyEx(nettoyee, nettoyee, cv.MORPH_CLOSE, noyauFermeture);

    encre1 = new cv.Mat();
    encre2 = new cv.Mat();
    cv.threshold(img1, encre1, SEUIL_ENCRE, 255, cv.THRESH_BINARY_INV);
    cv.threshold(img2, encre2, SEUIL_ENCRE, 255, cv.THRESH_BINARY_INV);

    const discordance =
      cv.countNonZero(nettoyee) / Math.max(1, img1.cols * img1.rows);

    cv.findContours(
      nettoyee,
      contours,
      hierarchie,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const airePlan = img1.cols * img1.rows;
    const zones: ZoneDifference[] = [];

    // `size()` est un appel Embind : on le lit une fois, pas à chaque tour.
    const nbContours = Math.min(contours.size(), NB_CONTOURS_MAX);

    for (let i = 0; i < nbContours; i += 1) {
      const contour = contours.get(i);
      try {
        const boite = cv.boundingRect(contour);
        const airesBoite = boite.width * boite.height;
        if (airesBoite < AIRE_MINIMALE_PX) continue;

        const aire = cv.contourArea(contour);

        const zone: ZoneDifference = {
          x: boite.x,
          y: boite.y,
          width: boite.width,
          height: boite.height,
          area: aire,
          aireRelative: airesBoite / airePlan,
          encrePE: partEncre(encre1, boite),
          encreEXE: partEncre(encre2, boite),
          type: "modified",
        };
        zone.type = classifyDiff(zone);
        zones.push(zone);
      } finally {
        libererTout(contour);
      }
    }

    // Les plus grandes d'abord : ce sont celles qui intéressent l'inspecteur.
    zones.sort((a, b) => b.aireRelative - a.aireRelative);
    return {
      zones: zones.slice(0, NB_ZONES_MAX),
      contours: contours.size(),
      discordance,
    };
  } finally {
    libererTout(
      difference,
      binaire,
      nettoyee,
      hierarchie,
      contours,
      noyauOuverture,
      noyauFermeture,
      encre1,
      encre2
    );
  }
}

/** Proportion de pixels encrés d'une zone, sur un masque binaire. */
function partEncre(
  masque: Mat,
  boite: { x: number; y: number; width: number; height: number }
): number {
  const cv = opencv();
  const region = masque.roi(
    new cv.Rect(boite.x, boite.y, boite.width, boite.height)
  );
  try {
    const surface = boite.width * boite.height;
    return surface > 0 ? cv.countNonZero(region) / surface : 0;
  } finally {
    libererTout(region);
  }
}

/**
 * Qualifie une différence à partir de l'encre présente de part et d'autre.
 *
 * - `added` : la zone est encrée sur le plan EXE et pas (ou peu) sur le PE —
 *   un élément a été ajouté à l'exécution.
 * - `removed` : l'inverse — un élément du plan d'enquête a disparu.
 * - `modified` : les deux plans portent du tracé au même endroit, mais il
 *   diffère — un élément déplacé, redimensionné ou redessiné.
 */
export function classifyDiff(
  zone: Pick<ZoneDifference, "encrePE" | "encreEXE">
): TypeDifference {
  const { encrePE, encreEXE } = zone;

  const peSignificatif = encrePE >= ENCRE_SIGNIFICATIVE;
  const exeSignificatif = encreEXE >= ENCRE_SIGNIFICATIVE;

  if (exeSignificatif && !peSignificatif) return "added";
  if (peSignificatif && !exeSignificatif) return "removed";

  if (exeSignificatif && encreEXE > encrePE * FACTEUR_DOMINANCE) return "added";
  if (peSignificatif && encrePE > encreEXE * FACTEUR_DOMINANCE) {
    return "removed";
  }

  return "modified";
}

/**
 * Écarte les différences trop petites pour être autre chose que du bruit.
 *
 * `minArea` s'exprime en **fraction de l'aire du plan**. Attention à l'ordre
 * de grandeur : sur un plan de 1600 × 1400 px, 0,01 vaut 22 400 px², soit un
 * carré de 150 px de côté — plus gros que la plupart des différences réelles
 * (une fenêtre supprimée en fait quelques milliers). La valeur par défaut est
 * donc volontairement haute et la page de comparaison passe la sienne.
 */
export function filterNoise(
  zones: ZoneDifference[],
  minArea = 0.01
): ZoneDifference[] {
  return zones.filter((zone) => zone.aireRelative >= minArea);
}

/**
 * Pipeline complet : chargement, prétraitement, alignement, détection,
 * classification, filtrage.
 *
 * Toutes les matrices intermédiaires sont libérées avant le retour — sans
 * quoi le tas WebAssembly grossirait à chaque analyse.
 */
export async function analyserPlans(
  urlPE: string,
  urlEXE: string,
  options: {
    seuilBruit?: number;
    largeurAnalyse?: number;
    /** Rapporte l'avancement, pour l'indicateur de progression. */
    onEtape?: (etape: EtapeAnalyse) => void;
    /** Nombre d'aperçus miniatures à produire. 0 pour aucun. */
    nbApercus?: number;
    /** Écarter les cartouches de la comparaison. */
    ignorerCartouches?: boolean;
  } = {}
): Promise<ResultatAnalyse> {
  const {
    seuilBruit = 0.0005,
    largeurAnalyse = LARGEUR_ANALYSE,
    onEtape,
    nbApercus = NB_APERCUS,
    ignorerCartouches = true,
  } = options;

  const etape = async (valeur: EtapeAnalyse) => {
    onEtape?.(valeur);
    // Laisse le navigateur peindre l'étape avant d'entamer le travail lourd.
    await respirer();
  };

  await chargerOpenCv();

  const [imagePE, imageEXE] = await Promise.all([
    chargerImage(urlPE),
    chargerImage(urlEXE),
  ]);

  let couleurPE: Mat | null = null;
  let couleurEXE: Mat | null = null;
  let memeTaillePE: Mat | null = null;
  let memeTailleEXE: Mat | null = null;
  let grisPE: Mat | null = null;
  let grisEXE: Mat | null = null;
  let normalisePE: Mat | null = null;
  let normaliseEXE: Mat | null = null;
  let alignee: Mat | null = null;
  let masqueRecouvrement: Mat | null = null;
  let masqueCartouches: Mat | null = null;
  let masqueComparaison: Mat | null = null;
  let cartouches: Rect[] = [];

  try {
    await etape("preparation-1");
    couleurPE = opencv().imread(canevasDepuisImage(imagePE, largeurAnalyse));

    await etape("preparation-2");
    couleurEXE = opencv().imread(canevasDepuisImage(imageEXE, largeurAnalyse));

    const memeTaille = resizeToSameDimensions(couleurPE, couleurEXE);
    memeTaillePE = memeTaille.img1;
    memeTailleEXE = memeTaille.img2;

    grisPE = convertToGrayscale(memeTaillePE);
    grisEXE = convertToGrayscale(memeTailleEXE);

    normalisePE = normalizeBrightness(grisPE);
    normaliseEXE = normalizeBrightness(grisEXE);

    await etape("alignement");
    const alignement = alignPlans(normalisePE, normaliseEXE);
    alignee = alignement.image;
    masqueRecouvrement = alignement.masque;

    // L'échelle sort du même appariement que le recalage : inutile de relancer
    // une détection ORB pour la calculer une seconde fois.
    const echelle: ResultatEchelle = {
      echelle: alignement.echelle ?? 1,
      correspondances: alignement.correspondances,
      fiable:
        alignement.echelle !== null &&
        alignement.echelle > 0.2 &&
        alignement.echelle < 5,
    };

    if (ignorerCartouches) {
      const exclusion = exclureCartouches(normalisePE, alignee);
      masqueCartouches = exclusion.masque;
      cartouches = exclusion.zones;
    }

    await etape("detection");
    masqueComparaison = combinerMasques(masqueRecouvrement, masqueCartouches);
    const detection = detectStructuralDiffsAdvanced(
      normalisePE,
      alignee,
      masqueComparaison
    );

    await etape("classification");
    const zones = filterNoise(detection.zones, seuilBruit) as ZoneAvancee[];
    const aligne =
      alignement.aligne && detection.discordance <= DISCORDANCE_MAX;

    if (aligne && nbApercus > 0) {
      construireApercus(zones.slice(0, nbApercus), normalisePE, alignee);
    }

    return {
      zones,
      contours: detection.contours,
      discordance: detection.discordance,
      largeur: normalisePE.cols,
      hauteur: normalisePE.rows,
      correspondances: alignement.correspondances,
      // Le plan PE fait 1 de large en unités monde : un pixel d'analyse vaut
      // donc 1/largeur, et l'origine est le coin supérieur gauche.
      repere: {
        origineX: 0,
        origineY: 0,
        unitesParPixel: 1 / Math.max(1, normalisePE.cols),
      },
      avertissement: null,
      cartouches,
      // Une homographie plausible ne suffit pas : si le résidu couvre une part
      // importante de la page, les deux plans ne se correspondent pas.
      aligne,
      echelle,
      raison: aligne
        ? null
        : (alignement.raison ??
          "Les deux plans diffèrent sur une part trop importante de leur surface"),
    };
  } finally {
    libererTout(
      couleurPE,
      couleurEXE,
      memeTaillePE,
      memeTailleEXE,
      grisPE,
      grisEXE,
      normalisePE,
      normaliseEXE,
      alignee,
      // `combinerMasques` réutilise le premier masque quand les deux existent :
      // les libérer tous deux le supprimerait deux fois.
      masqueRecouvrement,
      masqueComparaison === masqueRecouvrement ? null : masqueCartouches
    );
  }
}

/** Nombre d'aperçus produits par défaut : au-delà, la mémoire ne suit plus. */
const NB_APERCUS = 60;

/** Marge autour de la zone dans l'aperçu, en proportion de sa taille. */
const MARGE_APERCU = 0.35;

/** Hauteur d'un aperçu, en pixels. */
const HAUTEUR_APERCU = 64;

/** Couleurs d'affichage par type de différence, partagées calque et panneau. */
export const HEX_TYPE: Record<TypeDifference, string> = {
  added: "#2E7D32",
  removed: "#B41E1E",
  modified: "#F59E0B",
  moved: "#002855",
};

export const LIBELLES_DIFFERENCE: Record<TypeDifference, string> = {
  added: "Ajouté",
  removed: "Supprimé",
  modified: "Modifié",
  moved: "Déplacé",
};

export const ICONES_DIFFERENCE: Record<TypeDifference, string> = {
  added: "add_circle",
  removed: "do_not_disturb_on",
  modified: "change_circle",
  moved: "open_with",
};

/**
 * Produit une vignette « avant / après » par zone, côte à côte.
 *
 * Les vignettes sont découpées dans les images **effectivement comparées** —
 * en niveaux de gris, après normalisation et recalage — et non dans les plans
 * d'origine : ce que voit l'utilisateur est ce qu'a vu l'algorithme.
 */
function construireApercus(zones: ZoneAvancee[], pe: Mat, exe: Mat): void {
  const cv = opencv();

  const canevasPE = document.createElement("canvas");
  const canevasEXE = document.createElement("canvas");

  try {
    cv.imshow(canevasPE, pe);
    cv.imshow(canevasEXE, exe);
  } catch {
    // Sans vignette, le tableau reste utilisable.
    return;
  }

  for (const zone of zones) {
    const marge = Math.round(
      Math.max(zone.width, zone.height) * MARGE_APERCU + 4
    );
    const sx = Math.max(0, zone.x - marge);
    const sy = Math.max(0, zone.y - marge);
    const sw = Math.min(canevasPE.width - sx, zone.width + marge * 2);
    const sh = Math.min(canevasPE.height - sy, zone.height + marge * 2);
    if (sw < 4 || sh < 4) continue;

    const largeurVignette = Math.max(
      16,
      Math.round((sw / sh) * HAUTEUR_APERCU)
    );

    const vignette = document.createElement("canvas");
    vignette.width = largeurVignette * 2 + 1;
    vignette.height = HAUTEUR_APERCU;
    const ctx = vignette.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, vignette.width, vignette.height);
    ctx.drawImage(canevasPE, sx, sy, sw, sh, 0, 0, largeurVignette, HAUTEUR_APERCU);
    ctx.drawImage(
      canevasEXE, sx, sy, sw, sh,
      largeurVignette + 1, 0, largeurVignette, HAUTEUR_APERCU
    );

    // Séparateur, puis le cadre de la zone reporté sur les deux moitiés.
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(largeurVignette, 0, 1, vignette.height);

    const fx = ((zone.x - sx) / sw) * largeurVignette;
    const fy = ((zone.y - sy) / sh) * HAUTEUR_APERCU;
    const fw = (zone.width / sw) * largeurVignette;
    const fh = (zone.height / sh) * HAUTEUR_APERCU;
    ctx.strokeStyle = HEX_TYPE[zone.type];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fx, fy, Math.max(2, fw), Math.max(2, fh));
    ctx.strokeRect(fx + largeurVignette + 1, fy, Math.max(2, fw), Math.max(2, fh));

    zone.apercu = vignette.toDataURL("image/png");
  }
}

// ============================================================
// Détection avancée
// ============================================================

/** Étapes rapportées au fil de l'analyse, pour l'indicateur de progression. */
export type EtapeAnalyse =
  | "preparation-1"
  | "preparation-2"
  | "alignement"
  | "detection"
  | "classification";

export const LIBELLES_ETAPE: Record<EtapeAnalyse, string> = {
  "preparation-1": "Analyse de l'image 1/2…",
  "preparation-2": "Analyse de l'image 2/2…",
  alignement: "Alignement des plans…",
  detection: "Détection des différences…",
  classification: "Classification des écarts…",
};

export interface ZoneAvancee extends ZoneDifference {
  /** Confiance dans la différence, de 0 à 1. */
  confiance: number;
  /** Dissimilarité structurelle moyenne de la zone (1 − SSIM), de 0 à 1. */
  dissimilarite: number;
  /** Vrai si un blob compact a été détecté dans la zone. */
  blob: boolean;
  /** Vignette « avant / après » en data URL, si elle a pu être produite. */
  apercu?: string;
}

export type TypeCorrespondance =
  | "deplace"
  | "redimensionne"
  | "ajoute"
  | "supprime"
  | "identique";

export interface CorrespondanceStructurelle {
  type: TypeCorrespondance;
  /** Index dans `contours1`, ou null si l'élément n'existe que dans le plan 2. */
  index1: number | null;
  /** Index dans `contours2`, ou null si l'élément n'existe que dans le plan 1. */
  index2: number | null;
  /** Déplacement du centre, en pixels. */
  deplacement: number;
  /** Rapport des aires (plan 2 / plan 1). */
  rapportAire: number;
}

export interface ResultatEchelle {
  /** Rapport d'échelle estimé du plan 2 par rapport au plan 1. */
  echelle: number;
  /** Correspondances ayant servi à l'estimation. */
  correspondances: number;
  /** Faux si trop peu de correspondances pour conclure. */
  fiable: boolean;
}

/** Fenêtre gaussienne du SSIM, telle que définie par Wang et al. (2004). */
const SSIM_FENETRE = 11;
const SSIM_SIGMA = 1.5;
// Constantes de stabilisation pour des valeurs sur 8 bits : (0,01·255)² et (0,03·255)².
const SSIM_C1 = 6.5025;
const SSIM_C2 = 58.5225;

/** Voisinage du seuillage adaptatif, en pixels. Impair obligatoire. */
const VOISINAGE_ADAPTATIF = 21;
const CONSTANTE_ADAPTATIVE = 8;

/** Filtre bilatéral : lisse le grain sans émousser les traits. */
const BILATERAL_DIAMETRE = 5;
const BILATERAL_SIGMA_COULEUR = 45;
const BILATERAL_SIGMA_ESPACE = 45;

/** Au-delà de cette dissimilarité, un pixel est retenu comme différent. */
const SEUIL_DISSIMILARITE = 0.28;

/** Poids du score de confiance. Leur somme vaut 1. */
const POIDS = {
  dissimilarite: 0.45,
  encre: 0.3,
  blob: 0.15,
  surface: 0.1,
};

/** Une zone atteint le poids « surface » à partir de cette aire relative. */
const SURFACE_PLEINE = 0.004;

/**
 * Carte de dissimilarité structurelle, dérivée du SSIM.
 *
 * OpenCV ne fournit pas le SSIM : il est calculé ici selon la formule de Wang
 * et al., par convolutions gaussiennes des moyennes, variances et covariance.
 * On renvoie `(1 − SSIM) / 2` ramené sur 8 bits — 0 là où les deux plans sont
 * structurellement identiques, 255 là où ils n'ont plus rien de commun.
 *
 * Le SSIM voit ce que la différence absolue manque : un trait légèrement
 * déplacé ou un aplat de densité différente, là où `absdiff` ne réagit qu'aux
 * écarts d'intensité pixel à pixel.
 */
function carteDissimilarite(img1: Mat, img2: Mat): Mat {
  const cv = opencv();

  const a = new cv.Mat();
  const b = new cv.Mat();
  const a2 = new cv.Mat();
  const b2 = new cv.Mat();
  const ab = new cv.Mat();
  const mu1 = new cv.Mat();
  const mu2 = new cv.Mat();
  const mu1_2 = new cv.Mat();
  const mu2_2 = new cv.Mat();
  const mu1mu2 = new cv.Mat();
  const sigma1 = new cv.Mat();
  const sigma2 = new cv.Mat();
  const sigma12 = new cv.Mat();
  const t1 = new cv.Mat();
  const t2 = new cv.Mat();
  const t3 = new cv.Mat();
  const t4 = new cv.Mat();
  const ssim = new cv.Mat();
  const vide = new cv.Mat();
  const resultat = new cv.Mat();

  const fenetre = new cv.Size(SSIM_FENETRE, SSIM_FENETRE);
  const flou = (source: Mat, destination: Mat) =>
    cv.GaussianBlur(source, destination, fenetre, SSIM_SIGMA);

  try {
    img1.convertTo(a, cv.CV_32F);
    img2.convertTo(b, cv.CV_32F);

    cv.multiply(a, a, a2, 1, cv.CV_32F);
    cv.multiply(b, b, b2, 1, cv.CV_32F);
    cv.multiply(a, b, ab, 1, cv.CV_32F);

    flou(a, mu1);
    flou(b, mu2);
    cv.multiply(mu1, mu1, mu1_2, 1, cv.CV_32F);
    cv.multiply(mu2, mu2, mu2_2, 1, cv.CV_32F);
    cv.multiply(mu1, mu2, mu1mu2, 1, cv.CV_32F);

    flou(a2, sigma1);
    cv.subtract(sigma1, mu1_2, sigma1, vide, cv.CV_32F);
    flou(b2, sigma2);
    cv.subtract(sigma2, mu2_2, sigma2, vide, cv.CV_32F);
    flou(ab, sigma12);
    cv.subtract(sigma12, mu1mu2, sigma12, vide, cv.CV_32F);

    // `convertTo(dst, type, alpha, beta)` calcule alpha·x + beta : c'est la
    // façon la moins coûteuse d'appliquer un facteur et une constante, sans
    // allouer de matrice de remplissage.

    // numérateur = (2·μ1μ2 + C1) · (2·σ12 + C2)
    mu1mu2.convertTo(t1, cv.CV_32F, 2, SSIM_C1);
    sigma12.convertTo(t2, cv.CV_32F, 2, SSIM_C2);
    cv.multiply(t1, t2, t3, 1, cv.CV_32F);

    // dénominateur = (μ1² + μ2² + C1) · (σ1² + σ2² + C2)
    cv.add(mu1_2, mu2_2, t4, vide, cv.CV_32F);
    t4.convertTo(t1, cv.CV_32F, 1, SSIM_C1);
    cv.add(sigma1, sigma2, t4, vide, cv.CV_32F);
    t4.convertTo(t2, cv.CV_32F, 1, SSIM_C2);
    cv.multiply(t1, t2, t4, 1, cv.CV_32F);

    cv.divide(t3, t4, ssim, 1, cv.CV_32F);

    // (1 − SSIM) / 2, ramené sur 8 bits
    ssim.convertTo(resultat, cv.CV_8UC1, -127.5, 127.5);
    return resultat;
  } catch (erreur) {
    libererTout(resultat);
    throw erreur;
  } finally {
    libererTout(
      a, b, a2, b2, ab, mu1, mu2, mu1_2, mu2_2, mu1mu2,
      sigma1, sigma2, sigma12, t1, t2, t3, t4, ssim, vide
    );
  }
}

/** Masque d'encre robuste à l'éclairage, par seuillage adaptatif. */
function masqueEncreAdaptatif(img: Mat): Mat {
  const cv = opencv();
  const masque = new cv.Mat();
  try {
    cv.adaptiveThreshold(
      img,
      masque,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      VOISINAGE_ADAPTATIF,
      CONSTANTE_ADAPTATIVE
    );
    return masque;
  } catch (erreur) {
    libererTout(masque);
    throw erreur;
  }
}

/** Centres des blobs compacts repérés sur la carte de dissimilarité. */
function centresBlobs(carte: Mat): { x: number; y: number }[] {
  const cv = opencv();
  const detecteur = new cv.SimpleBlobDetector();
  const pointsCles = new cv.KeyPointVector();

  try {
    const parametres = detecteur.getParams();
    // Une différence de plan n'est ni ronde ni convexe : seule l'aire compte.
    parametres.filterByColor = false;
    parametres.filterByCircularity = false;
    parametres.filterByInertia = false;
    parametres.filterByConvexity = false;
    parametres.filterByArea = true;
    parametres.minArea = AIRE_MINIMALE_PX;
    parametres.maxArea = carte.cols * carte.rows;
    parametres.minDistBetweenBlobs = 6;
    parametres.thresholdStep = 20;
    detecteur.setParams(parametres);

    detecteur.detect(carte, pointsCles);

    const centres: { x: number; y: number }[] = [];
    const nombre = pointsCles.size();
    for (let i = 0; i < nombre; i += 1) {
      const point = pointsCles.get(i).pt;
      centres.push({ x: point.x, y: point.y });
    }
    return centres;
  } catch {
    // Le détecteur de blobs n'est qu'un appoint de confiance : son échec ne
    // doit pas faire tomber l'analyse.
    return [];
  } finally {
    libererTout(detecteur, pointsCles);
  }
}

/**
 * Détection structurelle avancée.
 *
 * Filtre bilatéral → seuillage adaptatif → carte de dissimilarité SSIM →
 * morphologie → contours, avec appoint de `SimpleBlobDetector`. Chaque zone
 * repart avec une confiance de 0 à 1.
 *
 * Les deux images doivent être en niveaux de gris, de même taille et alignées.
 */
export function detectStructuralDiffsAdvanced(
  img1: Mat,
  img2: Mat,
  /**
   * Masque du recouvrement issu de l'alignement. Hors de cette zone, le plan 2
   * n'a rien posé : la comparaison n'y a pas de sens et ne doit rien signaler.
   */
  masqueRecouvrement: Mat | null = null
): { zones: ZoneAvancee[]; contours: number; discordance: number } {
  const cv = opencv();

  const lisse1 = new cv.Mat();
  const lisse2 = new cv.Mat();
  const binaire = new cv.Mat();
  const nettoyee = new cv.Mat();
  const hierarchie = new cv.Mat();
  const contours = new cv.MatVector();
  let dissimilarite: Mat | null = null;
  let encre1: Mat | null = null;
  let encre2: Mat | null = null;
  let noyauOuverture: Mat | null = null;
  let noyauFermeture: Mat | null = null;

  try {
    // Le filtre bilatéral atténue le grain de numérisation sans émousser les
    // traits, contrairement à un flou gaussien qui les diluerait.
    cv.bilateralFilter(
      img1, lisse1,
      BILATERAL_DIAMETRE, BILATERAL_SIGMA_COULEUR, BILATERAL_SIGMA_ESPACE,
      cv.BORDER_DEFAULT
    );
    cv.bilateralFilter(
      img2, lisse2,
      BILATERAL_DIAMETRE, BILATERAL_SIGMA_COULEUR, BILATERAL_SIGMA_ESPACE,
      cv.BORDER_DEFAULT
    );

    dissimilarite = carteDissimilarite(lisse1, lisse2);

    cv.threshold(
      dissimilarite,
      binaire,
      Math.round(SEUIL_DISSIMILARITE * 255),
      255,
      cv.THRESH_BINARY
    );

    noyauOuverture = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(NOYAU_OUVERTURE, NOYAU_OUVERTURE)
    );
    noyauFermeture = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(NOYAU_FERMETURE, NOYAU_FERMETURE)
    );
    cv.morphologyEx(binaire, nettoyee, cv.MORPH_OPEN, noyauOuverture);
    cv.morphologyEx(nettoyee, nettoyee, cv.MORPH_CLOSE, noyauFermeture);

    // Hors recouvrement, il n'y a rien à comparer : les bordures découvertes
    // par la transformation ne sont pas des différences.
    if (masqueRecouvrement) {
      cv.bitwise_and(nettoyee, masqueRecouvrement, nettoyee);
    }

    // La discordance se rapporte à la surface réellement comparée, pas au
    // cadre entier : sinon un plan projeté plus petit que son cadre semblerait
    // toujours discordant.
    const airePlan = masqueRecouvrement
      ? Math.max(1, cv.countNonZero(masqueRecouvrement))
      : Math.max(1, img1.cols * img1.rows);

    const discordance = cv.countNonZero(nettoyee) / airePlan;

    encre1 = masqueEncreAdaptatif(lisse1);
    encre2 = masqueEncreAdaptatif(lisse2);

    const blobs = centresBlobs(dissimilarite);

    cv.findContours(
      nettoyee,
      contours,
      hierarchie,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const zones: ZoneAvancee[] = [];
    const nbContours = Math.min(contours.size(), NB_CONTOURS_MAX);

    for (let i = 0; i < nbContours; i += 1) {
      const contour = contours.get(i);
      try {
        const boite = cv.boundingRect(contour);
        const aireBoite = boite.width * boite.height;
        if (aireBoite < AIRE_MINIMALE_PX) continue;

        const encrePE = partEncre(encre1, boite);
        const encreEXE = partEncre(encre2, boite);
        const dissim = moyenneRegion(dissimilarite, boite) / 255;
        const aireRelative = aireBoite / airePlan;

        const contientBlob = blobs.some(
          (centre) =>
            centre.x >= boite.x &&
            centre.x <= boite.x + boite.width &&
            centre.y >= boite.y &&
            centre.y <= boite.y + boite.height
        );

        const base: ZoneDifference = {
          x: boite.x,
          y: boite.y,
          width: boite.width,
          height: boite.height,
          area: cv.contourArea(contour),
          aireRelative,
          encrePE,
          encreEXE,
          type: "modified",
        };
        base.type = classifyDiff(base);

        zones.push({
          ...base,
          dissimilarite: dissim,
          blob: contientBlob,
          confiance: calculerConfiance({
            dissimilarite: dissim,
            encrePE,
            encreEXE,
            blob: contientBlob,
            aireRelative,
          }),
        });
      } finally {
        libererTout(contour);
      }
    }

    zones.sort((a, b) => b.confiance - a.confiance);
    const retenues = zones.slice(0, NB_ZONES_MAX);

    // Un motif présent des deux côtés mais ailleurs n'est pas une modification :
    // c'est un déplacement. On ne le cherche que sur les zones les mieux
    // classées, chaque recherche ayant un coût.
    let recherches = 0;
    for (const zone of retenues) {
      if (recherches >= NB_RECHERCHES_DEPLACEMENT) break;
      if (zone.type !== "modified") continue;
      recherches += 1;
      if (motifDeplace(lisse1, lisse2, zone)) zone.type = "moved";
    }

    return {
      zones: retenues,
      contours: contours.size(),
      discordance,
    };
  } finally {
    libererTout(
      lisse1, lisse2, binaire, nettoyee, hierarchie, contours,
      dissimilarite, encre1, encre2, noyauOuverture, noyauFermeture
    );
  }
}

/**
 * Cherche le motif du plan 1 dans le voisinage du plan 2.
 *
 * Une corrélation forte à une position **décalée** signifie que l'élément n'a
 * pas changé, il a bougé. `absdiff` et le SSIM ne savent pas faire la
 * différence : ils voient du tracé qui apparaît ici et disparaît là.
 */
function motifDeplace(
  plan1: Mat,
  plan2: Mat,
  zone: { x: number; y: number; width: number; height: number }
): boolean {
  const cv = opencv();

  // Une recherche n'a de sens que sur un motif assez grand pour être identifié.
  if (zone.width < 8 || zone.height < 8) return false;

  const marge = Math.round(Math.max(zone.width, zone.height) * 1.5) + 8;
  const rx = Math.max(0, zone.x - marge);
  const ry = Math.max(0, zone.y - marge);
  const rw = Math.min(plan2.cols - rx, zone.width + marge * 2);
  const rh = Math.min(plan2.rows - ry, zone.height + marge * 2);

  // matchTemplate exige une fenêtre strictement plus grande que le gabarit.
  if (rw <= zone.width || rh <= zone.height) return false;

  let modele: Mat | null = null;
  let fenetre: Mat | null = null;
  const scores = new cv.Mat();

  try {
    modele = plan1.roi(new cv.Rect(zone.x, zone.y, zone.width, zone.height));
    fenetre = plan2.roi(new cv.Rect(rx, ry, rw, rh));

    cv.matchTemplate(fenetre, modele, scores, cv.TM_CCOEFF_NORMED);
    const { maxVal, maxLoc } = cv.minMaxLoc(scores);

    if (maxVal < CORRELATION_DEPLACEMENT) return false;

    // Position du meilleur score, ramenée dans le repère du plan.
    const decalage = Math.hypot(rx + maxLoc.x - zone.x, ry + maxLoc.y - zone.y);
    return decalage >= DECALAGE_MINIMAL;
  } catch {
    // Une recherche impossible laisse simplement la zone en « modifié ».
    return false;
  } finally {
    libererTout(modele, fenetre, scores);
  }
}

/** Moyenne des valeurs d'une région, sur une matrice 8 bits monocanal. */
function moyenneRegion(
  matrice: Mat,
  boite: { x: number; y: number; width: number; height: number }
): number {
  const cv = opencv();
  const region = matrice.roi(
    new cv.Rect(boite.x, boite.y, boite.width, boite.height)
  );
  try {
    return cv.mean(region)[0];
  } finally {
    libererTout(region);
  }
}

/**
 * Confiance de 0 à 1.
 *
 * Quatre éléments concordants valent mieux qu'un seul très marqué : une zone
 * n'atteint un score élevé que si la dissimilarité structurelle, le contraste
 * d'encre entre les deux plans, la présence d'un blob compact et la surface
 * vont dans le même sens.
 */
function calculerConfiance(mesures: {
  dissimilarite: number;
  encrePE: number;
  encreEXE: number;
  blob: boolean;
  aireRelative: number;
}): number {
  const dissimilarite = borner01(mesures.dissimilarite / SEUIL_DISSIMILARITE);
  // Plus l'encre diffère entre les deux plans, plus le constat est net.
  const contraste = borner01(
    Math.abs(mesures.encrePE - mesures.encreEXE) /
      Math.max(0.02, Math.max(mesures.encrePE, mesures.encreEXE))
  );
  const surface = borner01(mesures.aireRelative / SURFACE_PLEINE);

  const score =
    POIDS.dissimilarite * dissimilarite +
    POIDS.encre * contraste +
    POIDS.blob * (mesures.blob ? 1 : 0) +
    POIDS.surface * surface;

  return Math.round(borner01(score) * 100) / 100;
}

function borner01(valeur: number): number {
  if (!Number.isFinite(valeur)) return 0;
  return Math.min(1, Math.max(0, valeur));
}

/**
 * Apparie les contours des deux plans et qualifie chaque correspondance.
 *
 * L'appariement est glouton : pour chaque contour du plan 1, on retient le
 * candidat du plan 2 le plus proche au sens d'un coût mêlant la distance des
 * centres, l'écart d'aire et la dissemblance de forme (`matchShapes`).
 */
export function matchStructuralElements(
  contours1: MatVector,
  contours2: MatVector,
  options: {
    /** Déplacement en deçà duquel deux centres sont « au même endroit », en pixels. */
    toleranceDeplacement?: number;
    /** Écart d'aire toléré avant de parler de redimensionnement. */
    toleranceAire?: number;
    /** Coût au-delà duquel on refuse d'apparier. */
    coutMaximal?: number;
  } = {}
): CorrespondanceStructurelle[] {
  const cv = opencv();
  const {
    toleranceDeplacement = 8,
    toleranceAire = 0.15,
    coutMaximal = 1.2,
  } = options;

  const decrire = (vecteur: MatVector) => {
    const elements: {
      index: number;
      contour: Mat;
      cx: number;
      cy: number;
      aire: number;
      diagonale: number;
    }[] = [];
    for (let i = 0; i < vecteur.size(); i += 1) {
      const contour = vecteur.get(i);
      const boite = cv.boundingRect(contour);
      elements.push({
        index: i,
        contour,
        cx: boite.x + boite.width / 2,
        cy: boite.y + boite.height / 2,
        aire: Math.max(1, boite.width * boite.height),
        diagonale: Math.hypot(boite.width, boite.height),
      });
    }
    return elements;
  };

  const elements1 = decrire(contours1);
  const elements2 = decrire(contours2);

  try {
    const correspondances: CorrespondanceStructurelle[] = [];
    const pris = new Set<number>();

    for (const e1 of elements1) {
      let meilleur: (typeof elements2)[number] | null = null;
      let meilleurCout = Infinity;

      for (const e2 of elements2) {
        if (pris.has(e2.index)) continue;

        const distance = Math.hypot(e1.cx - e2.cx, e1.cy - e2.cy);
        // Au-delà de deux diagonales, ce ne peut pas être le même élément.
        if (distance > e1.diagonale * 2 + toleranceDeplacement) continue;

        const ecartAire = Math.abs(e2.aire - e1.aire) / e1.aire;
        let forme = 0;
        try {
          forme = cv.matchShapes(e1.contour, e2.contour, cv.CONTOURS_MATCH_I1, 0);
        } catch {
          forme = 1;
        }

        const cout =
          distance / Math.max(1, e1.diagonale) + ecartAire + Math.min(forme, 2);
        if (cout < meilleurCout) {
          meilleurCout = cout;
          meilleur = e2;
        }
      }

      if (!meilleur || meilleurCout > coutMaximal) {
        correspondances.push({
          type: "supprime",
          index1: e1.index,
          index2: null,
          deplacement: 0,
          rapportAire: 0,
        });
        continue;
      }

      pris.add(meilleur.index);

      const deplacement = Math.hypot(e1.cx - meilleur.cx, e1.cy - meilleur.cy);
      const rapportAire = meilleur.aire / e1.aire;
      const memeTaille = Math.abs(rapportAire - 1) <= toleranceAire;
      const memePosition = deplacement <= toleranceDeplacement;

      let type: TypeCorrespondance = "identique";
      if (memeTaille && !memePosition) type = "deplace";
      else if (!memeTaille && memePosition) type = "redimensionne";
      else if (!memeTaille && !memePosition) {
        // Déplacé ET redimensionné : on retient le changement dominant.
        type =
          deplacement / Math.max(1, e1.diagonale) > Math.abs(rapportAire - 1)
            ? "deplace"
            : "redimensionne";
      }

      correspondances.push({
        type,
        index1: e1.index,
        index2: meilleur.index,
        deplacement,
        rapportAire,
      });
    }

    for (const e2 of elements2) {
      if (pris.has(e2.index)) continue;
      correspondances.push({
        type: "ajoute",
        index1: null,
        index2: e2.index,
        deplacement: 0,
        rapportAire: 0,
      });
    }

    return correspondances;
  } finally {
    libererTout(
      ...elements1.map((e) => e.contour),
      ...elements2.map((e) => e.contour)
    );
  }
}

/**
 * Estime le rapport d'échelle du plan 2 par rapport au plan 1.
 *
 * Plutôt que de dériver l'échelle d'une homographie — qui mêle échelle,
 * rotation et perspective —, on compare directement les distances entre paires
 * de points appariés. La **médiane** des rapports est insensible aux
 * appariements erronés, nombreux sur des plans aux motifs répétitifs.
 *
 * Les deux images doivent être en niveaux de gris.
 */
export function estimateScale(img1: Mat, img2: Mat): ResultatEchelle {
  const cv = opencv();

  const orb = new cv.ORB(1500);
  const masque = new cv.Mat();
  const k1 = new cv.KeyPointVector();
  const k2 = new cv.KeyPointVector();
  const d1 = new cv.Mat();
  const d2 = new cv.Mat();
  const appariement = new cv.BFMatcher(cv.NORM_HAMMING, true);
  const correspondances = new cv.DMatchVector();

  try {
    orb.detectAndCompute(img1, masque, k1, d1);
    orb.detectAndCompute(img2, masque, k2, d2);

    if (d1.empty() || d2.empty()) {
      return { echelle: 1, correspondances: 0, fiable: false };
    }

    appariement.match(d1, d2, correspondances);

    const paires: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const nombre = correspondances.size();
    for (let i = 0; i < nombre; i += 1) {
      const c = correspondances.get(i);
      const p1 = k1.get(c.queryIdx).pt;
      const p2 = k2.get(c.trainIdx).pt;
      paires.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }

    if (paires.length < NB_CORRESPONDANCES_ECHELLE) {
      return { echelle: 1, correspondances: paires.length, fiable: false };
    }

    // Même calcul que dans `alignPlans` : une seule implémentation, pour que
    // les deux chemins ne puissent pas diverger.
    const mediane = echelleDepuisPaires(
      paires.map((p) => ({
        a: { x: p.x1, y: p.y1 },
        b: { x: p.x2, y: p.y2 },
      }))
    );

    if (mediane === null) {
      return { echelle: 1, correspondances: paires.length, fiable: false };
    }

    return {
      echelle: mediane,
      correspondances: paires.length,
      fiable: mediane > 0.2 && mediane < 5,
    };
  } finally {
    libererTout(orb, masque, k1, k2, d1, d2, appariement, correspondances);
  }
}

/** Minimum de correspondances pour qu'une estimation d'échelle ait un sens. */
const NB_CORRESPONDANCES_ECHELLE = 20;

// ============================================================
// Détection sur la vue recalée
// ============================================================

export interface CalquesVue {
  /** Rendu du seul plan PE, tel qu'il est affiché. */
  canevasPE: HTMLCanvasElement;
  /** Rendu du seul plan EXE, dans le même cadre et la même position. */
  canevasEXE: HTMLCanvasElement;
  /** Passage des pixels de ces canevas aux unités monde OpenSeadragon. */
  repere: RepereMonde;
}

/**
 * Détecte les différences sur la vue **telle que l'utilisateur l'a recalée**.
 *
 * C'est la seule approche qui tienne quand les deux dossiers ne sont pas
 * dessinés au même format. Mesuré sur le chantier Orllati : le plan PE est sur
 * une page carrée et l'EXE sur une A-série paysage ; le PE couvre un bâtiment
 * quand l'EXE en couvre deux ; et les échelles vont du 1:100 au 1:50. Aucune
 * mise en correspondance automatique ne s'en sort — ORB apparie majoritairement
 * à faux et RANSAC en tire une homographie dégénérée.
 *
 * Ici, **aucun recalage n'est calculé** : les deux calques sont pris dans la
 * position, l'échelle et le cadrage que l'utilisateur leur a donnés à l'écran.
 * Il fait le recalage, l'algorithme fait la différence.
 *
 * Conséquence sur les garde-fous : une discordance élevée ne fait plus échouer
 * l'analyse — l'utilisateur a affirmé que ces plans se correspondent, c'est son
 * jugement qui prime. Elle devient un avertissement, et seul un écart extrême
 * (`DISCORDANCE_REFUS`) fait renoncer.
 */
export async function analyserVue(
  calques: CalquesVue,
  options: {
    seuilBruit?: number;
    onEtape?: (etape: EtapeAnalyse) => void;
    nbApercus?: number;
    /** Écarter les cartouches de la comparaison. */
    ignorerCartouches?: boolean;
  } = {}
): Promise<ResultatAnalyse> {
  const {
    seuilBruit = 0.0005,
    onEtape,
    nbApercus = NB_APERCUS,
    ignorerCartouches = true,
  } = options;

  const etape = async (valeur: EtapeAnalyse) => {
    onEtape?.(valeur);
    await respirer();
  };

  await chargerOpenCv();
  const cv = opencv();

  let couleurPE: Mat | null = null;
  let couleurEXE: Mat | null = null;
  let grisPE: Mat | null = null;
  let grisEXE: Mat | null = null;
  let normalisePE: Mat | null = null;
  let normaliseEXE: Mat | null = null;
  let masqueCartouches: Mat | null = null;
  let cartouches: Rect[] = [];

  try {
    await etape("preparation-1");
    couleurPE = cv.imread(calques.canevasPE);

    await etape("preparation-2");
    couleurEXE = cv.imread(calques.canevasEXE);

    grisPE = convertToGrayscale(couleurPE);
    grisEXE = convertToGrayscale(couleurEXE);

    // Les deux calques sortent du même canevas : mêmes dimensions par
    // construction, aucun redimensionnement ni alignement à faire.
    await etape("alignement");

    normalisePE = normalizeBrightness(grisPE);
    normaliseEXE = normalizeBrightness(grisEXE);

    // Aucun recalage n'est calculé ici, mais l'écart d'échelle **résiduel**
    // entre les deux calques renseigne sur la qualité du recalage manuel : à
    // 1, ils se superposent à la bonne taille ; loin de 1, le cadrage est à
    // reprendre. C'est l'information que l'utilisateur n'a pas autrement.
    const echelle = estimateScale(normalisePE, normaliseEXE);

    if (ignorerCartouches) {
      const exclusion = exclureCartouches(normalisePE, normaliseEXE);
      masqueCartouches = exclusion.masque;
      cartouches = exclusion.zones;
    }

    await etape("detection");
    const detection = detectStructuralDiffsAdvanced(
      normalisePE,
      normaliseEXE,
      masqueCartouches
    );

    await etape("classification");
    const zones = filterNoise(detection.zones, seuilBruit) as ZoneAvancee[];

    if (nbApercus > 0) {
      construireApercus(zones.slice(0, nbApercus), normalisePE, normaliseEXE);
    }

    const aligne = detection.discordance <= DISCORDANCE_REFUS;

    return {
      zones,
      contours: detection.contours,
      discordance: detection.discordance,
      largeur: normalisePE.cols,
      hauteur: normalisePE.rows,
      // Le recalage est celui de l'utilisateur : aucune correspondance calculée.
      correspondances: 0,
      aligne,
      echelle,
      raison: aligne
        ? null
        : "Les deux calques diffèrent sur la quasi-totalité de la vue",
      repere: calques.repere,
      cartouches,
      avertissement: composerAvertissement(aligne, detection.discordance, echelle),
    };
  } finally {
    libererTout(
      couleurPE,
      couleurEXE,
      grisPE,
      grisEXE,
      normalisePE,
      normaliseEXE,
      masqueCartouches
    );
  }
}

/**
 * Réserve à afficher après une analyse sur la vue recalée.
 *
 * Deux causes distinctes méritent d'être nommées séparément : un recalage à la
 * mauvaise échelle, et une divergence de contenu. La première se corrige, la
 * seconde s'accepte.
 */
function composerAvertissement(
  aligne: boolean,
  discordance: number,
  echelle: ResultatEchelle
): string | null {
  if (!aligne) return null;

  const reserves: string[] = [];

  if (echelle.fiable && Math.abs(echelle.echelle - 1) > 0.08) {
    reserves.push(
      `les deux calques ne sont pas à la même échelle (rapport estimé ${echelle.echelle}) : ` +
        "ajustez le zoom du calque du dessus, verrou ouvert"
    );
  }

  if (discordance > DISCORDANCE_MAX) {
    reserves.push(
      `${Math.round(discordance * 100)} % de la vue diffère : ` +
        "affinez le recalage ou resserrez le cadrage sur la zone à comparer"
    );
  }

  if (reserves.length === 0) return null;
  return `${reserves.join(" — ").replace(/^./, (c) => c.toUpperCase())}.`;
}

/**
 * Repère les cartouches des deux plans et en compose un masque commun.
 *
 * Un cartouche présent sur l'un des deux plans suffit à écarter la zone : la
 * comparaison n'y a pas de sens, quel que soit le plan qui le porte.
 */
function exclureCartouches(
  planPE: Mat,
  planEXE: Mat
): { masque: Mat | null; zones: Rect[] } {
  const zones = [
    ...detecterCartouches(planPE),
    ...detecterCartouches(planEXE),
  ];
  return {
    masque: masqueHorsCartouches(planPE.cols, planPE.rows, zones),
    zones,
  };
}

/** Combine deux masques, en tolérant que l'un ou l'autre soit absent. */
function combinerMasques(a: Mat | null, b: Mat | null): Mat | null {
  if (!a) return b;
  if (!b) return a;
  const cv = opencv();
  cv.bitwise_and(a, b, a);
  return a;
}
