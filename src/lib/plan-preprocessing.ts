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

import {
  opencv,
  type CLAHE,
  type Mat,
  type Rect,
  type Size,
} from "@/lib/opencv";

/** Nombre de points d'intérêt demandés à ORB sur chaque plan. */
const NB_POINTS_ORB = 3000;

/** Correspondances conservées, les meilleures d'abord. */
const NB_CORRESPONDANCES_MAX = 400;

/**
 * Seuils d'appariement, appliqués au **nombre de correspondances trouvées**
 * (après contrôle croisé), et non au sous-ensemble retenu pour l'homographie.
 *
 * - en deçà de `NB_CORRESPONDANCES_MIN`, on refuse de conclure : les deux plans
 *   n'ont pas assez de points communs pour qu'un recalage ait un sens ;
 * - entre les deux seuils, on recale sans estimer l'échelle : la médiane des
 *   rapports de distances serait trop bruitée sur si peu de paires ;
 * - au-delà de `NB_CORRESPONDANCES_ECHELLE`, l'échelle est estimée en prime,
 *   à partir des mêmes appariements — aucune détection supplémentaire.
 */
const NB_CORRESPONDANCES_MIN = 30;
const NB_CORRESPONDANCES_ECHELLE = 100;

/** Tolérance de reprojection RANSAC, en pixels. */
const SEUIL_RANSAC = 4;

/** Paramètres CLAHE : contraste local, sans écraser les traits fins. */
const LIMITE_CONTRASTE = 2;
const TAILLE_TUILE = 8;

export interface ResultatAlignement {
  /**
   * Plan 2 replacé dans le repère du plan 1.
   *
   * **Toujours renseigné**, y compris en cas d'échec : l'appelant reçoit alors
   * une copie non transformée du plan 2, pour qu'il n'ait jamais à composer
   * avec l'absence d'image. À supprimer par l'appelant dans tous les cas.
   */
  image: Mat;
  /** Nombre de correspondances trouvées entre les deux plans. */
  correspondances: number;
  /** Faux si aucune homographie exploitable n'a été trouvée. */
  aligne: boolean;
  /**
   * Rapport d'échelle du plan 2 par rapport au plan 1.
   *
   * `null` quand il n'a pas été estimé — soit l'alignement a échoué, soit les
   * correspondances étaient trop peu nombreuses pour que la médiane des
   * rapports de distances veuille dire quelque chose.
   */
  echelle: number | null;
  /** Motif de l'échec, `null` lorsque l'alignement a abouti. */
  raison: string | null;
  /**
   * Masque du recouvrement : blanc là où le plan 2 a réellement atterri après
   * transformation, noir ailleurs. À supprimer par l'appelant.
   *
   * `null` quand aucune transformation n'a été appliquée — tout le cadre est
   * alors valide.
   *
   * Sans lui, les bordures découvertes par la transformation seraient comptées
   * comme des différences : projeter un dessin au 1:50 dans le cadre d'un
   * 1:100 remplit une large part du cadre de blanc, ce qui suffit à faire
   * dépasser le seuil de discordance et à refuser une comparaison pourtant
   * réussie.
   */
  masque: Mat | null;
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
 * Ramène les deux images à une taille commune, **sans déformer la seconde**.
 *
 * La première sert de référence : c'est le plan PE, repère de la comparaison
 * et des annotations existantes.
 *
 * ⚠️ Le rapport d'aspect doit être préservé. Deux plans du même ouvrage sont
 * couramment mis en page différemment — l'un sur une page carrée, l'autre sur
 * une A-série paysage. Étirer le second aux dimensions du premier lui inflige
 * une déformation anisotrope qui **détruit les descripteurs ORB** : les
 * appariements deviennent aléatoires et RANSAC en tire une homographie
 * dégénérée, qui écrase le plan en quelques pixels. Constaté sur le chantier
 * Orllati : PE au rapport 1,000, EXE au rapport 1,415, soit 41 % d'étirement
 * vertical, et un alignement systématiquement refusé.
 *
 * La seconde image est donc mise à l'échelle par le facteur le plus
 * contraignant, puis centrée sur un fond blanc aux dimensions de la première.
 * Le blanc imite le papier vierge : les marges ajoutées ne seront pas lues
 * comme des différences.
 */
export function resizeToSameDimensions(
  img1: Mat,
  img2: Mat
): { img1: Mat; img2: Mat } {
  const cv = opencv();

  const reference = img1.clone();
  const miseAEchelle = new cv.Mat();
  let fond: Mat | null = null;
  let region: Mat | null = null;

  try {
    // Le facteur le plus contraignant : l'image entière doit tenir dans le
    // cadre, quitte à laisser des marges.
    const facteur = Math.min(img1.cols / img2.cols, img1.rows / img2.rows);
    const largeur = Math.max(1, Math.min(img1.cols, Math.round(img2.cols * facteur)));
    const hauteur = Math.max(1, Math.min(img1.rows, Math.round(img2.rows * facteur)));

    // INTER_AREA préserve les traits fins à la réduction, ce que
    // l'interpolation bilinéaire ne fait pas.
    const interpolation = facteur < 1 ? cv.INTER_AREA : cv.INTER_LINEAR;

    cv.resize(
      img2,
      miseAEchelle,
      new cv.Size(largeur, hauteur),
      0,
      0,
      interpolation
    );

    if (largeur === img1.cols && hauteur === img1.rows) {
      // Mêmes proportions : aucune marge à ajouter.
      return { img1: reference, img2: miseAEchelle };
    }

    fond = new cv.Mat(
      img1.rows,
      img1.cols,
      img2.type(),
      new cv.Scalar(255, 255, 255, 255)
    );

    const decalageX = Math.floor((img1.cols - largeur) / 2);
    const decalageY = Math.floor((img1.rows - hauteur) / 2);
    region = fond.roi(new cv.Rect(decalageX, decalageY, largeur, hauteur));
    miseAEchelle.copyTo(region);

    const resultat = fond;
    fond = null;
    return { img1: reference, img2: resultat };
  } catch (erreur) {
    libererTout(reference, fond);
    throw erreur;
  } finally {
    libererTout(region);
    // La version mise à l'échelle n'est conservée que si elle est renvoyée
    // telle quelle ; sinon elle a été recopiée dans le fond.
    if (miseAEchelle.rows !== img1.rows || miseAEchelle.cols !== img1.cols) {
      libererTout(miseAEchelle);
    }
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
 * Le traitement se fait par paliers, selon le nombre de correspondances :
 * - **moins de 30** : on refuse de conclure. Deux plans d'étages différents,
 *   ou orientés différemment, tombent ici.
 * - **de 30 à 100** : homographie et transformation, sans estimation
 *   d'échelle — trop peu de paires pour que la médiane des rapports de
 *   distances soit fiable.
 * - **plus de 100** : homographie, transformation et estimation de l'échelle,
 *   tirée des **mêmes** appariements. Aucune détection supplémentaire.
 *
 * Sans alignement fiable, la fonction renvoie une **copie non transformée**
 * du plan 2, `aligne: false` et le motif du refus : à l'appelant de décider
 * s'il poursuit.
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
      return echec(
        img2,
        0,
        "Aucun point d'intérêt exploitable sur l'un des deux plans"
      );
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

    // Le palier porte sur le nombre de correspondances trouvées ; seules les
    // meilleures servent ensuite à calculer l'homographie.
    const nbCorrespondances = retenues.length;

    if (nbCorrespondances < NB_CORRESPONDANCES_MIN) {
      return echec(img2, nbCorrespondances, "Plans trop différents");
    }

    retenues.sort((a, b) => a.distance - b.distance);
    const meilleures = retenues.slice(0, NB_CORRESPONDANCES_MAX);

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

    if (homographie.empty()) {
      return echec(
        img2,
        nbCorrespondances,
        "Aucune transformation n'a pu être calculée entre les deux plans"
      );
    }
    if (!homographiePlausible(homographie, img1.cols, img1.rows)) {
      return echec(
        img2,
        nbCorrespondances,
        "La transformation trouvée replie ou déporte le plan hors du cadre"
      );
    }

    const alignee = new cv.Mat();
    const masqueRecouvrement = new cv.Mat();
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

      construireMasqueRecouvrement(img2, homographie, img1, masqueRecouvrement);
    } catch (erreur) {
      libererTout(alignee, masqueRecouvrement);
      throw erreur;
    }

    // L'échelle n'est estimée qu'au-delà du second palier : sous ce nombre de
    // paires, la médiane des rapports de distances est trop bruitée pour dire
    // quoi que ce soit.
    const echelle =
      nbCorrespondances > NB_CORRESPONDANCES_ECHELLE
        ? echelleDepuisPaires(
            meilleures.map((c) => ({
              a: pointsCles1.get(c.cible).pt,
              b: pointsCles2.get(c.source).pt,
            }))
          )
        : null;

    return {
      image: alignee,
      correspondances: nbCorrespondances,
      aligne: true,
      echelle,
      raison: null,
      masque: masqueRecouvrement,
    };
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

/** Érosion du masque, en pixels : le liseré d'interpolation du bord ne doit pas
 *  compter comme du contenu valide. */
const EROSION_MASQUE = 5;

/**
 * Transporte un masque plein à travers la même homographie que l'image.
 *
 * Le résultat marque exactement la zone où le plan 2 a atterri. L'interpolation
 * laisse un liseré sur le pourtour : on l'érode, faute de quoi il ressortirait
 * comme une différence en bordure de recouvrement.
 */
function construireMasqueRecouvrement(
  source: Mat,
  homographie: Mat,
  reference: Mat,
  destination: Mat
): void {
  const cv = opencv();

  const plein = new cv.Mat(
    source.rows,
    source.cols,
    cv.CV_8UC1,
    new cv.Scalar(255, 255, 255, 255)
  );
  const projete = new cv.Mat();
  let noyau: Mat | null = null;

  try {
    cv.warpPerspective(
      plein,
      projete,
      homographie,
      new cv.Size(reference.cols, reference.rows),
      // Plus proche voisin : un masque doit rester binaire.
      cv.INTER_NEAREST,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 0)
    );

    noyau = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(EROSION_MASQUE, EROSION_MASQUE)
    );
    cv.morphologyEx(projete, destination, cv.MORPH_ERODE, noyau);
  } finally {
    libererTout(plein, projete, noyau);
  }
}

/** Échec d'alignement : le plan 2 repart tel quel, avec le motif du refus. */
function echec(
  img2: Mat,
  correspondances: number,
  raison: string
): ResultatAlignement {
  return {
    image: img2.clone(),
    correspondances,
    aligne: false,
    echelle: null,
    raison,
    masque: null,
  };
}

/**
 * Rapport d'échelle, par la médiane des rapports de distances entre paires de
 * points appariés.
 *
 * Comparer des distances plutôt que de lire l'homographie évite de confondre
 * l'échelle avec la rotation et la perspective, qu'elle mêle. La **médiane**
 * encaisse les appariements erronés, nombreux sur des plans aux motifs
 * répétitifs, là où une moyenne serait emportée par quelques aberrations.
 */
export function echelleDepuisPaires(
  paires: { a: Point2D; b: Point2D }[]
): number | null {
  const rapports: number[] = [];
  // Un pas premier par rapport à la longueur échantillonne toute la liste sans
  // privilégier une région du plan.
  const pas = 7;

  for (let i = 0; i < paires.length; i += 1) {
    const un = paires[i];
    const deux = paires[(i + pas) % paires.length];
    const distance1 = Math.hypot(un.a.x - deux.a.x, un.a.y - deux.a.y);
    const distance2 = Math.hypot(un.b.x - deux.b.x, un.b.y - deux.b.y);
    // Deux points trop proches donnent un rapport dominé par le bruit.
    if (distance1 < 20 || distance2 < 20) continue;
    rapports.push(distance2 / distance1);
  }

  if (rapports.length < 10) return null;

  rapports.sort((a, b) => a - b);
  const mediane = rapports[Math.floor(rapports.length / 2)];

  if (!Number.isFinite(mediane) || mediane <= 0) return null;
  return Math.round(mediane * 1000) / 1000;
}

export type { Point2D };

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

export type { Rect, Size };

// ============================================================
// Cartouches
// ============================================================

/**
 * Un cartouche occupe au moins cette part de la page. En deçà, c'est une pièce
 * du dessin, pas un cartouche.
 */
const AIRE_MIN_CARTOUCHE = 0.008;

/**
 * Et au plus celle-ci. Au-delà, le rectangle trouvé est le cadre de la feuille
 * ou une grande zone du bâtiment : l'exclure reviendrait à ne plus rien
 * comparer.
 */
const AIRE_MAX_CARTOUCHE = 0.3;

/** Distance au bord, en part de la page, pour considérer qu'un cadre l'accoste. */
const TOLERANCE_BORD = 0.04;

/** Tolérance de l'approximation polygonale, en part du périmètre. */
const EPSILON_POLYGONE = 0.02;

/** Marge ajoutée autour d'un cartouche retenu, en part de sa taille. */
const MARGE_CARTOUCHE = 0.02;

/**
 * Repère les cartouches d'un plan.
 *
 * Un cartouche est un **rectangle dessiné, accosté à un bord de la feuille**,
 * de taille intermédiaire — ni un détail du dessin, ni le cadre entier. Ces
 * trois conditions réunies sont ce qui le distingue du bâtiment, dont les
 * contours sont rarement des quadrilatères convexes plaqués contre le bord.
 *
 * Le contenu du cartouche — bureau, date, indice, numéro de plan — diffère
 * systématiquement entre un dossier d'enquête et un dossier d'exécution. Sans
 * exclusion, il produit des écarts à forte confiance qui n'en sont pas.
 *
 * ⚠️ **Heuristique, donc faillible.** Un plan dont le cartouche n'est pas
 * encadré passera au travers ; un grand rectangle plaqué au bord — une façade,
 * une coupe — pourra être exclu à tort. C'est pourquoi les zones retenues sont
 * renvoyées à l'appelant, qui doit les montrer et permettre de les désactiver.
 *
 * Attend une image en niveaux de gris.
 */
export function detecterCartouches(img: Mat): Rect[] {
  const cv = opencv();

  const encre = new cv.Mat();
  const ferme = new cv.Mat();
  const hierarchie = new cv.Mat();
  const contours = new cv.MatVector();
  let noyau: Mat | null = null;

  try {
    // Seuillage adaptatif : le trait du cadre ressort quel que soit l'éclairage.
    cv.adaptiveThreshold(
      img,
      encre,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      21,
      8
    );

    // Fermeture : un cadre interrompu par du texte doit redevenir continu,
    // sinon `approxPolyDP` n'y verra jamais un quadrilatère.
    noyau = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(encre, ferme, cv.MORPH_CLOSE, noyau);

    // RETR_LIST et non RETR_EXTERNAL : le cartouche est souvent imbriqué dans
    // le cadre de la feuille, donc jamais un contour de premier niveau.
    cv.findContours(
      ferme,
      contours,
      hierarchie,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    );

    const airePage = img.cols * img.rows;
    const margeX = img.cols * TOLERANCE_BORD;
    const margeY = img.rows * TOLERANCE_BORD;

    const retenus: Rect[] = [];
    const nbContours = Math.min(contours.size(), 20_000);

    for (let i = 0; i < nbContours; i += 1) {
      const contour = contours.get(i);
      const approximation = new cv.Mat();
      try {
        const perimetre = cv.arcLength(contour, true);
        if (perimetre < 40) continue;

        cv.approxPolyDP(
          contour,
          approximation,
          EPSILON_POLYGONE * perimetre,
          true
        );
        // Un cartouche est un quadrilatère convexe.
        if (approximation.rows !== 4) continue;
        if (!cv.isContourConvex(approximation)) continue;

        const boite = cv.boundingRect(contour);
        const part = (boite.width * boite.height) / airePage;
        if (part < AIRE_MIN_CARTOUCHE || part > AIRE_MAX_CARTOUCHE) continue;

        const accosteBord =
          boite.x <= margeX ||
          boite.y <= margeY ||
          boite.x + boite.width >= img.cols - margeX ||
          boite.y + boite.height >= img.rows - margeY;
        if (!accosteBord) continue;

        retenus.push(elargir(boite, img.cols, img.rows));
      } finally {
        libererTout(contour, approximation);
      }
    }

    return fusionner(retenus);
  } finally {
    libererTout(encre, ferme, hierarchie, contours, noyau);
  }
}

/** Marge autour d'un cartouche : son trait de cadre ne doit pas ressortir. */
function elargir(boite: Rect, largeur: number, hauteur: number): Rect {
  const marge = Math.round(
    Math.max(boite.width, boite.height) * MARGE_CARTOUCHE + 3
  );
  const x = Math.max(0, boite.x - marge);
  const y = Math.max(0, boite.y - marge);
  return {
    x,
    y,
    width: Math.min(largeur - x, boite.width + marge * 2),
    height: Math.min(hauteur - y, boite.height + marge * 2),
  };
}

/**
 * Fusionne les rectangles qui se recouvrent.
 * Le cadre d'un cartouche est souvent détecté plusieurs fois — trait intérieur,
 * trait extérieur, sous-cases — et une seule zone d'exclusion suffit.
 */
function fusionner(boites: Rect[]): Rect[] {
  const resultat: Rect[] = [];

  for (const boite of [...boites].sort(
    (a, b) => b.width * b.height - a.width * a.height
  )) {
    const chevauche = resultat.find((autre) => {
      const x = Math.max(autre.x, boite.x);
      const y = Math.max(autre.y, boite.y);
      const x2 = Math.min(autre.x + autre.width, boite.x + boite.width);
      const y2 = Math.min(autre.y + autre.height, boite.y + boite.height);
      if (x2 <= x || y2 <= y) return false;
      // Recouvrement d'au moins la moitié du plus petit des deux.
      const commun = (x2 - x) * (y2 - y);
      return commun >= 0.5 * Math.min(
        autre.width * autre.height,
        boite.width * boite.height
      );
    });

    if (!chevauche) resultat.push(boite);
  }

  return resultat;
}

/**
 * Masque des zones à comparer : blanc partout sauf sur les cartouches.
 * Renvoie null si aucun cartouche n'a été trouvé — inutile d'imposer un
 * masque plein à la détection.
 */
export function masqueHorsCartouches(
  largeur: number,
  hauteur: number,
  cartouches: Rect[]
): Mat | null {
  if (cartouches.length === 0) return null;

  const cv = opencv();
  const masque = new cv.Mat(
    hauteur,
    largeur,
    cv.CV_8UC1,
    new cv.Scalar(255, 255, 255, 255)
  );

  try {
    for (const boite of cartouches) {
      cv.rectangle(
        masque,
        new cv.Point(boite.x, boite.y),
        new cv.Point(boite.x + boite.width, boite.y + boite.height),
        new cv.Scalar(0, 0, 0, 0),
        -1
      );
    }
    return masque;
  } catch (erreur) {
    libererTout(masque);
    throw erreur;
  }
}

/* ------------------------------------------------------------------ */
/* Isolement des murs                                                  */
/* ------------------------------------------------------------------ */

/**
 * En dessous de cette intensité, un pixel est du trait plein.
 *
 * Plus sévère que le seuil d'encre général : un mur est dessiné en noir franc,
 * là où les hachures, les trames et les traits d'axe sont gris.
 */
const SEUIL_TRAIT_PLEIN = 150;

/**
 * Part de l'encre en deçà de laquelle il ne reste plus de trait plein.
 *
 * Sert à mesurer l'épaisseur du **trait le plus épais** du plan : c'est le
 * dernier noyau qui laisse encore quelque chose debout.
 */
const RESIDU_MURS = 0.01;

/**
 * Fraction de cette épaisseur maximale retenue comme seuil de mur.
 *
 * Un plan comporte des murs porteurs épais et des cloisons plus fines : viser
 * le trait le plus épais ne garderait que le noyau du bâtiment. Un peu moins
 * de la moitié conserve les cloisons tout en laissant partir le texte et la
 * cotation, mesurés entre un tiers et un quart de l'épaisseur d'un mur.
 */
const FRACTION_MUR = 0.45;

/** Bornes du noyau d'ouverture, en pixels. */
const NOYAU_MURS_MIN = 2;
const NOYAU_MURS_MAX = 14;

export interface MasqueMurs {
  /** Masque binaire des murs : 255 sur le trait, 0 ailleurs. */
  masque: Mat;
  /**
   * Côté du noyau d'ouverture retenu, en pixels — donc l'épaisseur minimale
   * d'un trait conservé. `0` signale que la séparation a échoué et que le
   * masque est celui de toute l'encre.
   */
  epaisseur: number;
}

/**
 * Isole les murs d'un plan.
 *
 * Ce qui distingue un mur du reste du dessin n'est ni sa forme ni sa position,
 * c'est son **épaisseur** : un mur est un trait plein de plusieurs pixels,
 * quand le texte, les cotes, les axes, les hachures et le contenu des
 * cartouches sont des traits fins. Une ouverture morphologique ne conserve que
 * ce qui contient entièrement le noyau : elle efface donc tout ce qui est plus
 * fin que lui et laisse les murs intacts.
 *
 * C'est ce qui permet à la comparaison de ne porter que sur le bâti. Aucune
 * heuristique de position n'y est nécessaire — la garniture d'un plan disparaît
 * parce qu'elle est fine, pas parce qu'on aurait deviné où elle se trouve.
 *
 * **Le noyau est mesuré sur le dessin, pas fixé d'avance** : voir
 * `choisirNoyauMurs()`. `noyauImpose` permet de forcer la même valeur sur les
 * deux plans d'une comparaison — sans quoi le plus dense des deux serait
 * érodé plus fort que l'autre, et la moitié de ses murs ressortirait comme
 * une différence.
 *
 * Si aucun trait ne se distingue, la séparation est déclarée impossible et
 * tout le tracé est renvoyé (`epaisseur: 0`) — mieux vaut une comparaison
 * bruitée qu'une comparaison vide.
 *
 * Attend une image en niveaux de gris. À libérer par l'appelant.
 */
export function masqueMurs(img: Mat, noyauImpose?: number): MasqueMurs {
  const cv = opencv();

  const encre = new cv.Mat();

  try {
    cv.threshold(img, encre, SEUIL_TRAIT_PLEIN, 255, cv.THRESH_BINARY_INV);
    const totalEncre = cv.countNonZero(encre);

    if (totalEncre === 0) {
      return { masque: encre.clone(), epaisseur: 0 };
    }

    const cote = noyauImpose ?? choisirNoyauMurs(encre, totalEncre);
    if (cote === 0) {
      // Aucun trait plein assez épais pour se distinguer du reste : le dessin
      // est trop fin ou trop uniforme. On rend tout plutôt que rien.
      return { masque: encre.clone(), epaisseur: 0 };
    }

    return { masque: ouvrir(encre, cote), epaisseur: cote };
  } finally {
    libererTout(encre);
  }
}

/**
 * Choisit le noyau qui sépare les murs du reste du tracé.
 *
 * L'épaisseur d'un mur n'est pas une constante : elle dépend de l'échelle du
 * dessin, du format de la feuille et de la résolution à laquelle on l'analyse.
 * Un plan de rez rendu sur 1600 px a des murs de 8 pixels ; le même plan vu au
 * travers du visualiseur, calque réduit à 60 %, en a 4. Un noyau fixe se
 * tromperait dans les deux sens — garder tout le texte, ou effacer le
 * bâtiment.
 *
 * On mesure donc le dessin par lui-même. Des ouvertures successives font
 * disparaître les traits par ordre d'épaisseur : le dernier noyau qui laisse
 * encore quelque chose debout donne l'épaisseur du trait le plus épais du
 * plan, c'est-à-dire des murs porteurs. Le seuil est pris à un peu moins de la
 * moitié de cette valeur, pour conserver aussi les cloisons.
 */
function choisirNoyauMurs(encre: Mat, totalEncre: number): number {
  const cv = opencv();

  let plusEpais = 0;
  for (let cote = NOYAU_MURS_MIN; cote <= NOYAU_MURS_MAX; cote += 1) {
    const ouvert = ouvrir(encre, cote);
    const reste = cv.countNonZero(ouvert) / totalEncre;
    libererTout(ouvert);
    if (reste < RESIDU_MURS) break;
    plusEpais = cote;
  }

  if (plusEpais < NOYAU_MURS_MIN) return 0;
  return Math.max(NOYAU_MURS_MIN, Math.round(plusEpais * FRACTION_MUR));
}

/** Ouverture morphologique par un carré de `cote` pixels. */
function ouvrir(source: Mat, cote: number): Mat {
  const cv = opencv();
  const noyau = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(cote, cote));
  const resultat = new cv.Mat();
  try {
    cv.morphologyEx(source, resultat, cv.MORPH_OPEN, noyau);
    return resultat;
  } catch (erreur) {
    libererTout(resultat);
    throw erreur;
  } finally {
    libererTout(noyau);
  }
}
