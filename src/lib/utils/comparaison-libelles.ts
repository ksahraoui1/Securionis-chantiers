/**
 * Libellés français des annotations de comparaison.
 *
 * Ce module ne dépend ni de React ni du navigateur : il est partagé entre la
 * couche d'annotations (client) et la génération du rapport PDF (serveur), qui
 * ne peut pas importer un module « use client ».
 */

export type TypeAnnotation = "arrow" | "circle" | "rect" | "text" | "highlight";
export type CouleurAnnotation = "red" | "orange" | "green" | "yellow";

export const LIBELLES_TYPE: Record<TypeAnnotation, string> = {
  arrow: "Flèche",
  circle: "Cercle",
  rect: "Rectangle",
  text: "Texte",
  highlight: "Marqueur",
};

export const COULEURS_ANNOTATION: {
  valeur: CouleurAnnotation;
  hex: string;
  libelle: string;
}[] = [
  { valeur: "red", hex: "#DC2626", libelle: "Critique" },
  { valeur: "orange", hex: "#E67E22", libelle: "Moyen" },
  { valeur: "green", hex: "#2E7D32", libelle: "Résolu" },
  { valeur: "yellow", hex: "#EAB308", libelle: "Info" },
];

export const HEX_COULEURS: Record<CouleurAnnotation, string> = Object.fromEntries(
  COULEURS_ANNOTATION.map((c) => [c.valeur, c.hex])
) as Record<CouleurAnnotation, string>;

export const LIBELLES_COULEUR: Record<CouleurAnnotation, string> =
  Object.fromEntries(
    COULEURS_ANNOTATION.map((c) => [c.valeur, c.libelle])
  ) as Record<CouleurAnnotation, string>;
