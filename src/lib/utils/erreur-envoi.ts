/**
 * Message d'erreur d'un envoi de capture vers l'API.
 *
 * Les trois routes de la comparaison qui reçoivent des images — rapport PDF,
 * envoi par email, rapport automatique — passent par un proxy avant d'atteindre
 * Next.js. Quand le corps de la requête dépasse ce que le proxy accepte, **la
 * requête n'atteint jamais l'application** : le refus vient de nginx, la
 * réponse n'est pas du JSON, aucune trace n'apparaît dans les journaux
 * applicatifs, et le repli générique (« la génération a échoué ») ne laisse
 * aucune prise. Le code d'état, lui, dit exactement ce qui s'est passé.
 */
export async function messageErreurEnvoi(
  reponse: Response,
  parDefaut: string
): Promise<string> {
  if (reponse.status === 413) {
    return (
      "L'image envoyée est trop volumineuse pour le serveur. " +
      "Réduisez la zone affichée (dézoomez) puis relancez."
    );
  }

  const corps = await reponse.json().catch(() => null);
  const message =
    corps && typeof corps === "object" && "error" in corps
      ? (corps as { error?: unknown }).error
      : null;

  return typeof message === "string" && message.trim()
    ? message
    : `${parDefaut} (erreur ${reponse.status})`;
}
