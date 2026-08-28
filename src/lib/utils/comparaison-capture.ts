/**
 * Capture PNG de la vue de comparaison des plans.
 *
 * La vue est faite de deux éléments superposés : le canevas d'OpenSeadragon,
 * qui porte les deux plans avec leurs opacités respectives, et une couche SVG
 * qui porte les annotations. Ils sont recomposés ici dans un canevas hors
 * écran, à la résolution native du canevas (donc 2× sur un écran HiDPI).
 *
 * html2canvas n'est pas utilisable ici : il ne sait pas analyser les couleurs
 * `oklch()` que Tailwind v4 génère pour toute sa palette (il lève « Attempting
 * to parse an unsupported color function »), et il rendrait au mieux à la
 * résolution CSS. La composition directe évite les deux écueils sans ajouter
 * de dépendance.
 */

export interface CaptureVue {
  blob: Blob;
  largeur: number;
  hauteur: number;
}

// Marqueur posé sur la couche d'annotations, pour la retrouver dans la vue
export const ATTRIBUT_COUCHE = "data-couche-annotations";

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const image = new Image();
    image.onload = () => resoudre(image);
    image.onerror = () =>
      rejeter(new Error("Le calque d'annotations n'a pas pu être rasterisé."));
    image.src = url;
  });
}

/**
 * Rasterise la couche SVG et la dessine par-dessus les plans.
 *
 * Le SVG affiché est étiré en CSS et n'a donc aucune dimension intrinsèque :
 * sans `width`, `height` et `viewBox` explicites, un `<img>` ne sait pas à
 * quelle taille le rendre.
 */
async function dessinerAnnotations(
  ctx: CanvasRenderingContext2D,
  couche: SVGSVGElement,
  largeurCss: number,
  hauteurCss: number,
  largeurCible: number,
  hauteurCible: number
): Promise<void> {
  const clone = couche.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(largeurCss));
  clone.setAttribute("height", String(hauteurCss));
  clone.setAttribute("viewBox", `0 0 ${largeurCss} ${hauteurCss}`);
  // Les polices de la page ne sont pas chargées dans un SVG rendu par <img> :
  // on impose une pile générique pour que les étiquettes restent lisibles.
  clone.style.fontFamily = "Helvetica, Arial, sans-serif";

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" })
  );

  try {
    const image = await chargerImage(url);
    ctx.drawImage(image, 0, 0, largeurCible, hauteurCible);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Compose la vue courante (plans + annotations) en une image PNG.
 * `zone` est le conteneur qui porte le visualiseur et la couche d'annotations.
 */
export async function capturerVue(zone: HTMLElement): Promise<CaptureVue> {
  const canevas = zone.querySelector("canvas");
  if (!(canevas instanceof HTMLCanvasElement)) {
    return Promise.reject(
      new Error("La vue de comparaison n'est pas encore prête.")
    );
  }

  const cible = document.createElement("canvas");
  cible.width = canevas.width;
  cible.height = canevas.height;

  const ctx = cible.getContext("2d");
  if (!ctx) {
    throw new Error("Le navigateur n'a pas fourni de contexte de dessin.");
  }

  // Le canevas d'OpenSeadragon est transparent là où aucun plan ne couvre :
  // sans fond blanc, l'image exportée serait illisible sur un fond sombre.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cible.width, cible.height);
  ctx.drawImage(canevas, 0, 0, cible.width, cible.height);

  const couche = zone.querySelector<SVGSVGElement>(`svg[${ATTRIBUT_COUCHE}]`);
  if (couche) {
    await dessinerAnnotations(
      ctx,
      couche,
      canevas.clientWidth || cible.width,
      canevas.clientHeight || cible.height,
      cible.width,
      cible.height
    );
  }

  const blob = await new Promise<Blob | null>((resoudre) =>
    cible.toBlob(resoudre, "image/png")
  );
  if (!blob) {
    throw new Error("La capture PNG n'a pas pu être produite.");
  }

  return { blob, largeur: cible.width, hauteur: cible.height };
}

/** Rend une valeur utilisable dans un nom de fichier. */
export function assainirNom(valeur: string): string {
  return (
    valeur
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chantier"
  );
}

/** Date du jour au format AAAA-MM-JJ, en heure locale. */
export function dateFichier(date = new Date()): string {
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 10);
}

/** Déclenche le téléchargement d'un blob sous le nom donné. */
export function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}
