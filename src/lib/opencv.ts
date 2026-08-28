/**
 * Chargement paresseux d'OpenCV.js.
 *
 * La bibliothèque pèse près de 10 Mo : elle n'est chargée qu'au premier appel,
 * et une seule fois par session. Le résultat est mémorisé ; un échec réarme la
 * mécanique pour qu'un nouvel essai soit possible.
 *
 * ⚠️ Client uniquement — OpenCV.js n'existe pas côté serveur.
 *
 * Le fichier est servi depuis `/vendor/opencv` et non depuis le CDN
 * `docs.opencv.org` : la CSP déclare `script-src 'self'`, et l'ouvrir à un
 * domaine tiers reviendrait à exécuter du code étranger sur une page qui porte
 * la session Supabase de l'utilisateur. Voir `public/vendor/opencv/LISEZ-MOI.md`.
 */

const CHEMIN_OPENCV = "/vendor/opencv/opencv.js";

// Le module met plusieurs secondes à s'initialiser sur une tablette ; au-delà,
// c'est que quelque chose a échoué silencieusement.
const DELAI_MAX_MS = 120_000;

const INTERVALLE_SONDAGE_MS = 50;

// ============================================================
// Typage minimal d'OpenCV.js
//
// La bibliothèque ne fournit pas de définitions TypeScript. Plutôt que
// d'ajouter une dépendance de types, on décrit ici la seule surface utilisée
// par le prétraitement et la détection de différences.
// ============================================================

export interface Mat {
  rows: number;
  cols: number;
  data: Uint8Array;
  delete(): void;
  empty(): boolean;
  roi(rect: Rect): Mat;
  clone(): Mat;
  doublePtr(ligne: number, colonne: number): Float64Array;
  doubleAt(ligne: number, colonne: number): number;
  convertTo(destination: Mat, type: number, alpha?: number, beta?: number): void;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface KeyPoint {
  pt: Point;
  size: number;
}

export interface DMatch {
  distance: number;
  queryIdx: number;
  trainIdx: number;
}

interface Vecteur<T> {
  size(): number;
  get(index: number): T;
  delete(): void;
}

export type MatVector = Vecteur<Mat>;
export type KeyPointVector = Vecteur<KeyPoint>;
export type DMatchVector = Vecteur<DMatch>;

export interface ORB {
  detectAndCompute(
    image: Mat,
    masque: Mat,
    pointsCles: KeyPointVector,
    descripteurs: Mat
  ): void;
  delete(): void;
}

export interface BFMatcher {
  match(requete: Mat, reference: Mat, correspondances: DMatchVector): void;
  delete(): void;
}

export interface CLAHE {
  apply(source: Mat, destination: Mat): void;
  delete(): void;
}

/**
 * Réglages de SimpleBlobDetector.
 *
 * ⚠️ `cv.SimpleBlobDetector_Params` existe mais **n'a pas de constructeur
 * accessible** depuis JavaScript dans ce build. Le seul moyen d'obtenir une
 * instance est `detecteur.getParams()`, à modifier puis à réinjecter par
 * `setParams()`.
 */
export interface ParametresBlob {
  thresholdStep: number;
  minThreshold: number;
  maxThreshold: number;
  minRepeatability: number;
  minDistBetweenBlobs: number;
  filterByColor: boolean;
  blobColor: number;
  filterByArea: boolean;
  minArea: number;
  maxArea: number;
  filterByCircularity: boolean;
  minCircularity: number;
  filterByInertia: boolean;
  minInertiaRatio: number;
  filterByConvexity: boolean;
  minConvexity: number;
  delete(): void;
}

export interface SimpleBlobDetector {
  getParams(): ParametresBlob;
  setParams(parametres: ParametresBlob): void;
  detect(image: Mat, pointsCles: KeyPointVector): void;
  delete(): void;
}

export interface CV {
  Mat: {
    new (): Mat;
    new (lignes: number, colonnes: number, type: number): Mat;
    zeros(lignes: number, colonnes: number, type: number): Mat;
    ones(lignes: number, colonnes: number, type: number): Mat;
  };
  MatVector: new () => MatVector;
  KeyPointVector: new () => KeyPointVector;
  DMatchVector: new () => DMatchVector;
  Size: new (largeur: number, hauteur: number) => Size;
  Point: new (x: number, y: number) => Point;
  Rect: new (x: number, y: number, largeur: number, hauteur: number) => Rect;
  Scalar: new (
    v0: number,
    v1?: number,
    v2?: number,
    v3?: number
  ) => [number, number, number, number];
  ORB: new (nbPoints?: number) => ORB;
  BFMatcher: new (typeNorme: number, controleCroise: boolean) => BFMatcher;
  CLAHE: new (limiteContraste: number, tailleTuile: Size) => CLAHE;
  SimpleBlobDetector: new () => SimpleBlobDetector;

  imread(source: HTMLCanvasElement | HTMLImageElement | string): Mat;
  imshow(cible: HTMLCanvasElement | string, source: Mat): void;
  matFromArray(
    lignes: number,
    colonnes: number,
    type: number,
    donnees: ArrayLike<number>
  ): Mat;

  cvtColor(source: Mat, destination: Mat, code: number): void;
  resize(
    source: Mat,
    destination: Mat,
    taille: Size,
    fx: number,
    fy: number,
    interpolation: number
  ): void;
  GaussianBlur(
    source: Mat,
    destination: Mat,
    noyau: Size,
    sigmaX: number
  ): void;
  absdiff(a: Mat, b: Mat, destination: Mat): void;
  add(a: Mat, b: Mat, destination: Mat, masque: Mat, type: number): void;
  subtract(a: Mat, b: Mat, destination: Mat, masque: Mat, type: number): void;
  multiply(a: Mat, b: Mat, destination: Mat, echelle: number, type: number): void;
  divide(a: Mat, b: Mat, destination: Mat, echelle: number, type: number): void;
  bitwise_or(a: Mat, b: Mat, destination: Mat): void;
  bitwise_and(a: Mat, b: Mat, destination: Mat): void;
  adaptiveThreshold(
    source: Mat,
    destination: Mat,
    maximum: number,
    methode: number,
    type: number,
    tailleVoisinage: number,
    constante: number
  ): void;
  bilateralFilter(
    source: Mat,
    destination: Mat,
    diametre: number,
    sigmaCouleur: number,
    sigmaEspace: number,
    modeBordure: number
  ): void;
  meanStdDev(source: Mat, moyenne: Mat, ecartType: Mat): void;
  mean(source: Mat, masque?: Mat): [number, number, number, number];
  matchShapes(
    contour1: Mat,
    contour2: Mat,
    methode: number,
    parametre: number
  ): number;
  moments(contour: Mat): { m00: number; m10: number; m01: number };
  matchTemplate(
    image: Mat,
    modele: Mat,
    resultat: Mat,
    methode: number,
    masque?: Mat
  ): void;
  minMaxLoc(source: Mat): {
    minVal: number;
    maxVal: number;
    minLoc: Point;
    maxLoc: Point;
  };
  threshold(
    source: Mat,
    destination: Mat,
    seuil: number,
    maximum: number,
    type: number
  ): number;
  getStructuringElement(forme: number, taille: Size): Mat;
  morphologyEx(
    source: Mat,
    destination: Mat,
    operation: number,
    noyau: Mat
  ): void;
  findContours(
    source: Mat,
    contours: MatVector,
    hierarchie: Mat,
    mode: number,
    methode: number
  ): void;
  boundingRect(contour: Mat): Rect;
  contourArea(contour: Mat): number;
  countNonZero(source: Mat): number;
  findHomography(
    pointsSource: Mat,
    pointsDestination: Mat,
    methode: number,
    seuilReprojection: number
  ): Mat;
  warpPerspective(
    source: Mat,
    destination: Mat,
    transformation: Mat,
    taille: Size,
    drapeaux: number,
    modeBordure: number,
    valeurBordure: [number, number, number, number]
  ): void;

  COLOR_RGBA2GRAY: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  BORDER_DEFAULT: number;
  CONTOURS_MATCH_I1: number;
  CV_32F: number;
  CV_32FC1: number;
  TM_CCOEFF_NORMED: number;
  INTER_AREA: number;
  INTER_LINEAR: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  MORPH_RECT: number;
  MORPH_OPEN: number;
  MORPH_CLOSE: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  NORM_HAMMING: number;
  RANSAC: number;
  BORDER_CONSTANT: number;
  CV_8UC1: number;
  CV_32FC2: number;
}

interface ModuleOpenCv extends Partial<CV> {
  onRuntimeInitialized?: () => void;
}

type FenetreOpenCv = Window & { cv?: ModuleOpenCv };

/**
 * Chargement en cours. La promesse porte `void` et **jamais le module** :
 * voir l'avertissement sur `chargerOpenCv()`.
 */
let chargement: Promise<void> | null = null;

function estUtilisable(module: ModuleOpenCv | undefined): module is CV {
  // `cv` existe dès l'exécution du script, mais ses classes n'apparaissent
  // qu'une fois le runtime WebAssembly initialisé.
  return typeof module?.Mat === "function";
}

function injecter(): Promise<void> {
  return new Promise<void>((resoudre, rejeter) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      rejeter(
        new Error(
          "OpenCV.js ne peut être chargé que dans le navigateur : la détection de différences est une fonction client."
        )
      );
      return;
    }

    const fenetre = window as FenetreOpenCv;
    if (estUtilisable(fenetre.cv)) {
      resoudre();
      return;
    }

    let sondage: ReturnType<typeof setInterval> | null = null;
    let expiration: ReturnType<typeof setTimeout> | null = null;
    let script: HTMLScriptElement | null = null;

    const arreter = () => {
      if (sondage) clearInterval(sondage);
      if (expiration) clearTimeout(expiration);
      sondage = null;
      expiration = null;
    };

    const echouer = (message: string) => {
      arreter();
      // Le script est retiré pour qu'un nouvel essai reparte proprement.
      script?.remove();
      rejeter(new Error(message));
    };

    const verifier = (): boolean => {
      if (estUtilisable(fenetre.cv)) {
        arreter();
        resoudre();
        return true;
      }
      return false;
    };

    script = document.createElement("script");
    script.src = CHEMIN_OPENCV;
    script.async = true;

    script.onerror = () =>
      echouer(
        "OpenCV.js n'a pas pu être chargé. Vérifiez votre connexion, puis réessayez."
      );

    script.onload = () => {
      if (verifier()) return;

      // Emscripten signale la fin de l'initialisation par ce rappel…
      if (fenetre.cv) {
        fenetre.cv.onRuntimeInitialized = () => verifier();
      }
      // …mais il a pu être consommé avant qu'on l'installe : on sonde aussi.
      sondage = setInterval(verifier, INTERVALLE_SONDAGE_MS);
    };

    expiration = setTimeout(
      () =>
        echouer(
          "OpenCV.js n'a pas fini de s'initialiser dans le temps imparti. Rechargez la page, puis réessayez."
        ),
      DELAI_MAX_MS
    );

    document.head.appendChild(script);
  });
}

/**
 * Charge OpenCV.js. La promesse se résout une fois le module prêt à l'emploi ;
 * le module lui-même se récupère ensuite par `opencv()`. Les appels suivants
 * réutilisent le même chargement.
 *
 * ⚠️ **Le module OpenCV ne doit jamais traverser une promesse.** Emscripten lui
 * donne une méthode `then` : c'est un *thenable*. `resolve(cv)` — ou un simple
 * `return cv` depuis une fonction `async`, ce qui revient au même — déclenche
 * la procédure de résolution des promesses, qui appelle `cv.then(resolve, …)`,
 * lequel rappelle avec le module lui-même. Adoption infinie, boucle de
 * micro-tâches, onglet figé à 100 % de CPU, sans erreur ni recouvrement
 * possible. D'où le `Promise<void>` : il n'est pas cosmétique.
 */
export async function chargerOpenCv(): Promise<void> {
  if (!chargement) {
    // Un échec ne doit pas condamner la session : on réarme pour l'essai suivant.
    chargement = injecter().catch((erreur: unknown) => {
      chargement = null;
      throw erreur;
    });
  }

  await chargement;
}

/**
 * Accès synchrone au module déjà chargé.
 * Lève si `chargerOpenCv()` n'a pas encore abouti — les fonctions de
 * prétraitement et de détection s'en servent pour garder les signatures
 * simples, la promesse n'étant attendue qu'une fois, en tête de pipeline.
 */
export function opencv(): CV {
  const fenetre = window as FenetreOpenCv;
  if (!estUtilisable(fenetre.cv)) {
    throw new Error(
      "OpenCV.js n'est pas encore chargé : appelez chargerOpenCv() avant d'utiliser cette fonction."
    );
  }
  return fenetre.cv;
}

/** Indique si OpenCV.js est déjà disponible, sans le charger. */
export function opencvPret(): boolean {
  if (typeof window === "undefined") return false;
  return estUtilisable((window as FenetreOpenCv).cv);
}
