/**
 * Prétraitement des plans avant la détection de différences.
 *
 * ⚠️ Client uniquement (OpenCV.js).
 *
 * **Gestion mémoire** : OpenCV.js alloue ses `Mat` dans le tas WebAssembly,
 * que le ramasse-miettes de JavaScript ignore. Chaque fonction ci-dessous
 * renvoie une **nouvelle** matrice dont l'appelant est responsable : il doit
 * appeler `.delete()`. `libererTout()` est fourni pour les blocs `finally`.
 */

import { opencv, type CLAHE, type Mat, type Size } from "@/lib/opencv";

/** Nombre de points d'intérêt demandés à ORB sur chaque plan. */
const NB_POINTS_ORB = 3000;

/** Correspondances conservées, les meilleures d'abord. */
const NB_CORRESPONDANCES_MAX = 400;

/** En deçà, l'homographie n'a aucune chance d'être fiable. */
const NB_CORRESPONDANCES_MIN = 12;

/** Tolérance de reprojection RANSAC, en pixels. */
const SEUIL_RANSAC = 4;

/** Paramètres CLAHE : contraste local, sans écraser les traits fins. */
const LIMITE_CONTRASTE = 2;
const TAILLE_TUILE = 8;

export interface ResultatAlignement {
  /** Plan 2 replacé dans le repère du plan 1. À supprimer par l'appelant. */
  image: Mat;
  /** Nombre de correspondances retenues par le filtrage. */
  correspondances: number;
  /** Faux si aucune homographie exploitable n'a été trouvée. */
  aligne: boolean;
}

/** Supprime toutes les ressources OpenCV fournies, en ignorant les nulles. */
export function libererTout(
  ...ressources: Array<{ delete(): void } | null | undefined>
): void {
  for (const ressource of ressources) {
    try {
      ressource?.delete();
    } catch {
      // Une ressource déjà libérée ne doit pas masquer l'erreur d'origine.
    }
  }
}

/**
 * Charge une image (URL blob ou distante) dans une matrice OpenCV.
 * `crossOrigin` est indispensable : sans lui, le canevas serait teinté et
 * `imread` échouerait sur les plans servis par le stockage Supabase.
 */
export function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resoudre(image);
    image.onerror = () =>
      rejeter(new Error("Le plan n'a pas pu être chargé pour l'analyse."));
    image.src = url;
  });
}

/**
 * Construit une matrice OpenCV à partir d'une image, éventuellement réduite.
 * Analyser un plan à 2400 px n'apporte rien et coûte plusieurs secondes :
 * `largeurMax` borne la résolution de travail.
 */
export function canevasDepuisImage(
  image: HTMLImageElement,
  largeurMax?: number
): HTMLCanvasElement {
  const echelle =
    largeurMax && image.naturalWidth > largeurMax
      ? largeurMax / image.naturalWidth
      : 1;

  const canevas = document.createElement("canvas");
  canevas.width = Math.max(1, Math.round(image.naturalWidth * echelle));
  canevas.height = Math.max(1, Math.round(image.naturalHeight * echelle));

  const contexte = canevas.getContext("2d");
  if (!contexte) {
    throw new Error("Le navigateur n'a pas fourni de contexte de dessin.");
  }

  // Fond blanc : un PDF rendu en PNG est transparent hors du tracé, et une
  // zone transparente deviendrait noire donc « encrée » aux yeux du seuillage.
  contexte.fillStyle = "#ffffff";
  contexte.fillRect(0, 0, canevas.width, canevas.height);
  contexte.drawImage(image, 0, 0, canevas.width, canevas.height);

  return canevas;
}

/** Idem, directement en matrice OpenCV. */
export function matDepuisImage(
  image: HTMLImageElement,
  largeurMax?: number
): Mat {
  return opencv().imread(canevasDepuisImage(image, largeurMax));
}

/**
 * Convertit une image en niveaux de gris.
 * Une image déjà monocanal est simplement clonée, pour que l'appelant ait
 * toujours une matrice qui lui appartient.
 */
export function convertToGrayscale(imageData: Mat): Mat {
  const cv = opencv();
  const gris = new cv.Mat();
  try {
    cv.cvtColor(imageData, gris, cv.COLOR_RGBA2GRAY);
    return gris;
  } catch (erreur) {
    libererTout(gris);
    throw erreur;
  }
}

/**
 * Ramène les deux images à une taille commune.
 * La première sert de référence — c'est le plan PE, repère de la comparaison
 * et des annotations existantes.
 */
export function resizeToSameDimensions(
  img1: Mat,
  img2: Mat
): { img1: Mat; img2: Mat } {
  const cv = opencv();

  const reference = img1.clone();
  const redimensionnee = new cv.Mat();

  try {
    // INTER_AREA préserve les traits fins à la réduction, ce que
    // l'interpolation bilinéaire ne fait pas.
    const interpolation =
      img2.cols > img1.cols ? cv.INTER_AREA : cv.INTER_LINEAR;

    cv.resize(
      img2,
      redimensionnee,
      new cv.Size(img1.cols, img1.rows),
      0,
      0,
      interpolation
    );

    return { img1: reference, img2: redimensionnee };
  } catch (erreur) {
    libererTout(reference, redimensionnee);
    throw erreur;
  }
}

/**
 * Normalise la luminosité et le contraste par égalisation adaptative (CLAHE).
 *
 * Un plan scanné ou exporté d'un PDF peut être globalement plus clair que
 * l'autre : sans cette étape, la différence absolue signalerait toute la page.
 * CLAHE travaille par tuiles, donc corrige aussi les dégradés locaux, là où
 * une normalisation globale ne verrait rien.
 *
 * Attend une image en niveaux de gris (8 bits, 1 canal).
 */
export function normalizeBrightness(img: Mat): Mat {
  const cv = opencv();
  const normalisee = new cv.Mat();
  let clahe: CLAHE | null = null;

  try {
    clahe = new cv.CLAHE(
      LIMITE_CONTRASTE,
      new cv.Size(TAILLE_TUILE, TAILLE_TUILE)
    );
    clahe.apply(img, normalisee);
    return normalisee;
  } catch (erreur) {
    libererTout(normalisee);
    throw erreur;
  } finally {
    libererTout(clahe);
  }
}

/**
 * Aligne le plan 2 (EXE) sur le plan 1 (PE) par appariement de points ORB.
 *
 * ORB détecte des points d'intérêt sur chaque plan, un appariement en force
 * brute avec contrôle croisé les met en correspondance, RANSAC en tire une
 * homographie robuste aux appariements erronés, et `warpPerspective` replace
 * le plan 2 dans le repère du plan 1.
 *
 * Les deux images doivent être en niveaux de gris et de même taille.
 *
 * Sans alignement fiable, la fonction renvoie une **copie non transformée**
 * du plan 2 et `aligne: false` : à l'appelant de décider s'il poursuit. Deux
 * plans d'étages différents, ou orientés différemment, tombent dans ce cas.
 */
export function alignPlans(img1: Mat, img2: Mat): ResultatAlignement {
  const cv = opencv();

  const orb = new cv.ORB(NB_POINTS_ORB);
  const masque = new cv.Mat();
  const pointsCles1 = new cv.KeyPointVector();
  const pointsCles2 = new cv.KeyPointVector();
  const descripteurs1 = new cv.Mat();
  const descripteurs2 = new cv.Mat();
  const appariement = new cv.BFMatcher(cv.NORM_HAMMING, true);
  const correspondances = new cv.DMatchVector();

  let pointsSource: Mat | null = null;
  let pointsDestination: Mat | null = null;
  let homographie: Mat | null = null;

  try {
    orb.detectAndCompute(img1, masque, pointsCles1, descripteurs1);
    orb.detectAndCompute(img2, masque, pointsCles2, descripteurs2);

    if (descripteurs1.empty() || descripteurs2.empty()) {
      return { image: img2.clone(), correspondances: 0, aligne: false };
    }

    // Requête = plan 2 (à déplacer), référence = plan 1 (repère).
    appariement.match(descripteurs2, descripteurs1, correspondances);

    const retenues: { distance: number; source: number; cible: number }[] = [];
    for (let i = 0; i < correspondances.size(); i += 1) {
      const c = correspondances.get(i);
      retenues.push({
        distance: c.distance,
        source: c.queryIdx,
        cible: c.trainIdx,
      });
    }

    retenues.sort((a, b) => a.distance - b.distance);
    const meilleures = retenues.slice(0, NB_CORRESPONDANCES_MAX);

    if (meilleures.length < NB_CORRESPONDANCES_MIN) {
      return {
        image: img2.clone(),
        correspondances: meilleures.length,
        aligne: false,
      };
    }

    const source: number[] = [];
    const destination: number[] = [];
    for (const c of meilleures) {
      const p2 = pointsCles2.get(c.source).pt;
      const p1 = pointsCles1.get(c.cible).pt;
      source.push(p2.x, p2.y);
      destination.push(p1.x, p1.y);
    }

    pointsSource = cv.matFromArray(
      meilleures.length,
      1,
      cv.CV_32FC2,
      source
    );
    pointsDestination = cv.matFromArray(
      meilleures.length,
      1,
      cv.CV_32FC2,
      destination
    );

    homographie = cv.findHomography(
      pointsSource,
      pointsDestination,
      cv.RANSAC,
      SEUIL_RANSAC
    );

    if (
      homographie.empty() ||
      !homographiePlausible(homographie, img1.cols, img1.rows)
    ) {
      return {
        image: img2.clone(),
        correspondances: meilleures.length,
        aligne: false,
      };
    }

    const alignee = new cv.Mat();
    try {
      cv.warpPerspective(
        img2,
        alignee,
        homographie,
        new cv.Size(img1.cols, img1.rows),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        // Blanc : les bords découverts par la transformation doivent ressembler
        // à du papier vierge, sinon ils seraient lus comme des différences.
        new cv.Scalar(255, 255, 255, 255)
      );
    } catch (erreur) {
      libererTout(alignee);
      throw erreur;
    }

    return { image: alignee, correspondances: meilleures.length, aligne: true };
  } finally {
    libererTout(
      orb,
      masque,
      pointsCles1,
      pointsCles2,
      descripteurs1,
      descripteurs2,
      appariement,
      correspondances,
      pointsSource,
      pointsDestination,
      homographie
    );
  }
}

/**
 * Garde-fou contre les homographies dégénérées.
 *
 * RANSAC renvoie parfois une transformation « valide » qui replie le plan sur
 * lui-même ou l'envoie hors cadre. On projette les quatre coins et on vérifie
 * que l'image reste à une échelle et une position raisonnables.
 */
function homographiePlausible(
  homographie: Mat,
  largeur: number,
  hauteur: number
): boolean {
  const h: number[] = [];
  for (let ligne = 0; ligne < 3; ligne += 1) {
    for (let colonne = 0; colonne < 3; colonne += 1) {
      h.push(homographie.doublePtr(ligne, colonne)[0]);
    }
  }

  const projeter = (x: number, y: number): Point2D | null => {
    const w = h[6] * x + h[7] * y + h[8];
    if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return null;
    return {
      x: (h[0] * x + h[1] * y + h[2]) / w,
      y: (h[3] * x + h[4] * y + h[5]) / w,
    };
  };

  const coins = [
    projeter(0, 0),
    projeter(largeur, 0),
    projeter(largeur, hauteur),
    projeter(0, hauteur),
  ];

  if (coins.some((coin) => coin === null)) return false;
  const valides = coins as Point2D[];

  if (valides.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) {
    return false;
  }

  const largeurProjetee = Math.hypot(
    valides[1].x - valides[0].x,
    valides[1].y - valides[0].y
  );
  const hauteurProjetee = Math.hypot(
    valides[3].x - valides[0].x,
    valides[3].y - valides[0].y
  );

  // Un plan EXE reste à l'échelle de son PE : au-delà d'un facteur 2 dans un
  // sens ou dans l'autre, ce ne sont pas les mêmes plans.
  const echelleLargeur = largeurProjetee / largeur;
  const echelleHauteur = hauteurProjetee / hauteur;
  if (
    echelleLargeur < 0.5 ||
    echelleLargeur > 2 ||
    echelleHauteur < 0.5 ||
    echelleHauteur > 2
  ) {
    return false;
  }

  // Et il ne doit pas partir très au-delà du cadre.
  const marge = Math.max(largeur, hauteur);
  return valides.every(
    (c) =>
      c.x > -marge &&
      c.x < largeur + marge &&
      c.y > -marge &&
      c.y < hauteur + marge
  );
}

interface Point2D {
  x: number;
  y: number;
}

export type { Size };
