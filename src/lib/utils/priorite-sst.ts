/**
 * Priorité et recommandation attachées à un écart détecté entre deux plans.
 *
 * ⚠️ **Ce n'est pas une analyse SST.** Rien ici ne « comprend » le plan : la
 * détection est géométrique, elle repère des zones où le tracé diffère. La
 * priorité ci-dessous est une **règle de tri déterministe**, calculée à partir
 * de la confiance de détection, de la surface concernée et du sens de l'écart.
 * Elle sert à faire remonter en tête ce qui mérite d'être regardé en premier ;
 * elle ne remplace en rien l'appréciation du chargé de sécurité, et le rapport
 * généré le dit explicitement.
 *
 * Le module ne dépend ni de React ni du navigateur : il est partagé par
 * l'interface et par la génération du rapport côté serveur.
 */

import type { TypeDifference } from "@/lib/plan-diff-detection";

export type PrioriteSST = "critique" | "eleve" | "moyen" | "faible";

export const ORDRE_PRIORITE: PrioriteSST[] = [
  "critique",
  "eleve",
  "moyen",
  "faible",
];

export const LIBELLES_PRIORITE: Record<PrioriteSST, string> = {
  critique: "Critique",
  eleve: "Élevé",
  moyen: "Moyen",
  faible: "Faible",
};

export const HEX_PRIORITE: Record<PrioriteSST, string> = {
  critique: "#B41E1E",
  eleve: "#E67E22",
  moyen: "#F59E0B",
  faible: "#2E7D32",
};

/** Surface, en part de la page, au-delà de laquelle un écart pèse davantage. */
const SURFACE_NOTABLE = 0.002;

export interface EcartEvalue {
  type: TypeDifference;
  confiance: number;
  aireRelative: number;
}

/**
 * Niveau de priorité d'un écart.
 *
 * Trois éléments entrent dans le score :
 * - la **confiance** de détection, qui domine — un écart douteux ne doit pas
 *   remonter en tête ;
 * - la **surface**, un grand écart étant plus difficile à ignorer ;
 * - le **sens** : un élément présent au plan d'enquête et absent à l'exécution
 *   est le cas qui appelle une vérification, une disposition ayant pu
 *   disparaître. Il gagne un cran.
 */
export function prioriteSST(ecart: EcartEvalue): PrioriteSST {
  let score = ecart.confiance;

  if (ecart.aireRelative >= SURFACE_NOTABLE) score += 0.1;
  if (ecart.type === "removed") score += 0.15;

  if (score >= 0.85) return "critique";
  if (score >= 0.6) return "eleve";
  if (score >= 0.4) return "moyen";
  return "faible";
}

const RECOMMANDATIONS: Record<TypeDifference, string> = {
  removed:
    "Élément présent au plan d'enquête et absent à l'exécution : vérifier sur site si une disposition de sécurité a été supprimée.",
  added:
    "Élément apparu à l'exécution : vérifier qu'il est prévu au dossier et qu'il ne crée pas de nouveau risque.",
  modified:
    "Tracé modifié entre les deux plans : confronter la cote au relevé et confirmer la version qui fait foi.",
  moved:
    "Élément déplacé sans changer de dimensions : vérifier que l'implantation retenue reste conforme aux dégagements et aux accès.",
};

export function recommandationSST(type: TypeDifference): string {
  return RECOMMANDATIONS[type];
}

export interface SyntheseEcarts {
  total: number;
  parPriorite: Record<PrioriteSST, number>;
  confianceMoyenne: number;
}

/** Comptes par priorité et confiance moyenne, pour le résumé exécutif. */
export function synthetiser(ecarts: EcartEvalue[]): SyntheseEcarts {
  const parPriorite: Record<PrioriteSST, number> = {
    critique: 0,
    eleve: 0,
    moyen: 0,
    faible: 0,
  };

  let cumul = 0;
  for (const ecart of ecarts) {
    parPriorite[prioriteSST(ecart)] += 1;
    cumul += ecart.confiance;
  }

  return {
    total: ecarts.length,
    parPriorite,
    confianceMoyenne: ecarts.length > 0 ? cumul / ecarts.length : 0,
  };
}
