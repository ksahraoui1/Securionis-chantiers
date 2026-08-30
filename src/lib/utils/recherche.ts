/**
 * Transforme une saisie libre en `tsquery` à préfixe.
 *
 * « echa » trouve ainsi « échafaudage » — la configuration `french_unaccent`
 * de la base rend la recherche insensible aux accents, le suffixe `:*` la rend
 * sensible aux préfixes.
 *
 * Le découpage sur les caractères non alphanumériques neutralise au passage
 * tous les opérateurs de la syntaxe tsquery (`&`, `|`, `!`, `<->`, parenthèses)
 * : une saisie utilisateur ne peut pas construire une requête arbitraire.
 *
 * Retourne `null` quand il ne reste aucun terme d'au moins deux caractères —
 * à l'appelant de décider s'il interroge sans filtre ou pas du tout.
 */
export function construireTsQuery(saisie: string): string | null {
  const termes = saisie
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  if (termes.length === 0) return null;
  return termes.map((t) => `${t}:*`).join(" & ");
}
