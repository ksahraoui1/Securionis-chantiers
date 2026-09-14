import { createServiceClient } from "@/lib/supabase/server";

/**
 * Limiteur de débit, compteurs en base.
 *
 * Les compteurs vivaient dans une `Map` en mémoire de processus. Or déployer
 * consiste à reconstruire et remplacer le conteneur : **chaque mise à jour
 * rendait son quota à tout le monde**, et toutes les fenêtres de cette
 * application durent une heure. Deux répliques derrière le proxy auraient par
 * ailleurs donné deux fois le quota, chacune avec sa propre `Map`.
 *
 * Postgres plutôt que Redis : la base est déjà là, l'opération tient en une
 * instruction atomique (`insert … on conflict do update`, qui prend un verrou
 * de ligne), et cela n'ajoute ni service à exploiter ni dépendance.
 *
 * ⚠️ La fonction `consommer_quota` n'est exécutable que par le `service_role`.
 * Elle renvoie un `boolean`, donc PostgREST l'exposerait sur `/rest/v1/rpc/` :
 * un compte connecté pourrait sinon appeler
 * `consommer_quota('photo-analyze:<autre>', 1, 3600)` en boucle et **épuiser le
 * quota de quelqu'un d'autre**. Voir migration 049.
 */

/**
 * Consomme un jeton pour `key`.
 *
 * @param key          identifiant, par convention `<route>:<userId>`
 * @param maxRequests  nombre d'appels autorisés dans la fenêtre
 * @param windowMs     durée de la fenêtre, en millisecondes
 * @returns `true` si l'appel est autorisé, `false` s'il dépasse le quota
 *
 * Un compteur indisponible refuse les opérations : aucune dépense sans quota.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  if (!key || key.length > 256 || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 100000 || !Number.isFinite(windowMs) || windowMs < 1000 || windowMs > 86400000) return false;
  try {
    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient.rpc("consommer_quota", {
      p_cle: key,
      p_max: maxRequests,
      p_fenetre_s: Math.max(1, Math.round(windowMs / 1000)),
    });

    if (error) {
      console.error(`[rate-limit] Échec du comptage pour « ${key} » :`, error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error(`[rate-limit] Exception lors du comptage pour « ${key} » :`, err);
    return false;
  }
}
