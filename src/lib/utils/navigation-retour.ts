/**
 * Destination du bouton « Retour » de la barre de navigation.
 *
 * Le parent d'une page ne s'obtient pas en retirant le dernier segment du
 * chemin : plusieurs routes n'ont pas de page à leur niveau intermédiaire.
 * `/chantiers/<id>/visites/nouvelle` remonterait ainsi sur
 * `/chantiers/<id>/visites`, qui n'existe pas et rendrait un 404. La table
 * ci-dessous est donc explicite.
 *
 * Le retour est **hiérarchique**, et non `history.back()` : sur une tablette de
 * chantier, en PWA installée, il n'y a pas de bouton de retour du navigateur et
 * l'historique peut aussi bien mener hors de l'application. Remonter d'un cran
 * dans l'arborescence donne toujours la même destination pour une page donnée,
 * ce qui est plus sûr et plus prévisible.
 */

const RACINE = "/dashboard";

const REGLES: Array<[RegExp, string]> = [
  // Le rapport appartient à sa visite, seul cas à deux niveaux de profondeur.
  [/^\/chantiers\/([^/]+)\/visites\/([^/]+)\/rapport$/, "/chantiers/$1/visites/$2"],
  // Visites (existante, nouvelle, préparation), NC, modification, comparaison :
  // toutes rattachées au chantier.
  [/^\/chantiers\/([^/]+)\/visites\/[^/]+$/, "/chantiers/$1"],
  [/^\/chantiers\/([^/]+)\/nc\/[^/]+$/, "/chantiers/$1"],
  [/^\/chantiers\/([^/]+)\/[^/]+$/, "/chantiers/$1"],
  // Un chantier, les archives et le formulaire de création remontent à la liste.
  [/^\/chantiers\/[^/]+$/, "/chantiers"],
  [/^\/chantiers$/, RACINE],
  [/^\/admin\/[^/]+$/, "/admin"],
  [/^\/admin$/, RACINE],
  [/^\/dashboard\/[^/]+$/, RACINE],
];

/** Libellé de la destination, pour l'infobulle du bouton. */
const LIBELLES: Array<[RegExp, string]> = [
  [/^\/chantiers\/[^/]+\/visites\/[^/]+$/, "Retour à la visite"],
  [/^\/chantiers\/[^/]+$/, "Retour au chantier"],
  [/^\/chantiers$/, "Retour aux chantiers"],
  [/^\/admin$/, "Retour à l'administration"],
  [/^\/dashboard$/, "Retour au tableau de bord"],
];

/**
 * Chemin parent, ou `null` sur le tableau de bord — la racine, d'où il n'y a
 * pas de retour. Un chemin inconnu retombe sur la racine plutôt que de faire
 * disparaître le bouton.
 */
export function parentDe(chemin: string): string | null {
  const p = chemin.replace(/\/+$/, "") || "/";
  if (p === RACINE) return null;

  for (const [motif, parent] of REGLES) {
    const trouve = p.match(motif);
    if (trouve) {
      return parent.replace(/\$(\d)/g, (_, rang: string) => trouve[Number(rang)] ?? "");
    }
  }
  return RACINE;
}

/** Libellé accessible du retour vers `destination`. */
export function libelleRetour(destination: string): string {
  for (const [motif, libelle] of LIBELLES) {
    if (motif.test(destination)) return libelle;
  }
  return "Retour";
}
