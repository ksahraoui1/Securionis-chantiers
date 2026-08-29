import { createServiceClient } from "@/lib/supabase/server";

/**
 * Journal d'audit — écriture serveur uniquement.
 *
 * Deux raisons de passer par ici plutôt que par un `.from("audit_logs")`
 * dispersé dans chaque route :
 *
 * 1. **Le journal n'est plus falsifiable.** Depuis la migration 046, le rôle
 *    `authenticated` n'a plus le droit d'écrire dans `audit_logs` : seul le
 *    `service_role`, qui ne vit que côté serveur, en est capable. Auparavant
 *    la politique `audit_logs_insert` était `WITH CHECK (true)` et n'importe
 *    quel compte connecté pouvait y insérer une ligne arbitraire — s'attribuer
 *    un envoi, en imputer un à quelqu'un d'autre, ou polluer l'historique
 *    d'envoi affiché sur la page rapport d'une visite qui ne lui appartient
 *    pas.
 *
 * 2. **Un échec cesse d'être silencieux.** Aucun des huit appels d'origine ne
 *    vérifiait son résultat. C'est ainsi que trois d'entre eux ont écrit
 *    pendant des semaines dans une colonne `resource_type` qui n'existe pas,
 *    sans que rien ne le signale.
 *
 * ⚠️ Les noms de colonnes sont `resource` (et non `resource_type`) et
 * `details` (et non `metadata`). Le typage ci-dessous les impose.
 */

export interface EntreeAudit {
  /** Auteur de l'action. Toujours l'utilisateur authentifié, jamais une valeur reçue du client. */
  userId: string;
  /** Verbe de l'action : `send_rapport_email`, `delete_visite`, `create_user`… */
  action: string;
  /** Table ou domaine concerné. Colonne `resource`. */
  resource: string;
  /** Identifiant de l'objet concerné. */
  resourceId?: string | null;
  /** Contexte libre. Colonne `details`. */
  details?: Record<string, unknown>;
}

/**
 * Inscrit une entrée au journal d'audit.
 *
 * Ne lève jamais : une action métier réussie ne doit pas échouer parce que sa
 * trace n'a pas pu être écrite. Retourne `false` et journalise côté serveur —
 * ce qui remonte à Sentry lorsqu'un DSN est configuré — pour que la perte de
 * traçabilité reste visible.
 */
export async function journaliser(entree: EntreeAudit): Promise<boolean> {
  // La garde côté serveur est portée par `createServiceClient()`, qui obtient
  // sa clé via `getServiceRoleKey()` : appelé depuis le navigateur, il lève.
  try {
    const serviceClient = await createServiceClient();
    const { error } = await serviceClient.from("audit_logs").insert({
      user_id: entree.userId,
      action: entree.action,
      resource: entree.resource,
      resource_id: entree.resourceId ?? null,
      details: entree.details ?? {},
    });

    if (error) {
      console.error(
        `[audit] Échec d'écriture (${entree.action} sur ${entree.resource}) :`,
        error.message,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[audit] Exception lors de l'écriture (${entree.action} sur ${entree.resource}) :`,
      err,
    );
    return false;
  }
}
