import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { canAccessVisite, extractRapportStoragePath } from "@/lib/utils/security";
import { checkRateLimit } from "@/lib/rate-limit";
import { journaliser } from "@/lib/audit";

/**
 * Suppression d'une visite en cours.
 *
 * L'autorisation est vérifiée avec le client de l'utilisateur
 * (`canAccessVisite`), puis la suppression elle-même est faite par le
 * `service_role` :
 *
 *   • aucune politique RLS n'autorise un inspecteur à supprimer une visite ou
 *     ses réponses — avec le client utilisateur, le `DELETE` ne touchait
 *     **aucune ligne** et PostgREST répondait succès quand même (piège
 *     n° 43) ; la route renvoyait `success: true` et écrivait une entrée
 *     `delete_visite` au journal pour une visite toujours là ;
 *   • les photos de la visite restaient dans le stockage : 28 orphelines
 *     relevées à l'audit du 3 septembre 2026.
 *
 * Ordre : les écarts, puis la visite (les réponses suivent en cascade), puis
 * les fichiers. Une ligne d'abord, le fichier ensuite — l'inverse laisserait
 * une visite dont les photos ont disparu si la suppression en base échoue.
 */

const BUCKET_PHOTOS = "visite-photos";

type ClientService = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Liste récursivement les fichiers sous un préfixe. L'API `list()` renvoie
 * les dossiers comme des entrées sans `id` (le type les annonce pourtant
 * `string`) : c'est ce qui distingue `<réponse>/` de `photo.jpg`.
 */
async function listerFichiers(
  serviceClient: ClientService,
  prefixe: string,
): Promise<string[]> {
  const { data, error } = await serviceClient.storage
    .from(BUCKET_PHOTOS)
    .list(prefixe, { limit: 1000 });
  if (error) throw new Error(`Listage du stockage impossible (${prefixe}) : ${error.message}`);

  const fichiers: string[] = [];
  for (const entree of data ?? []) {
    const chemin = `${prefixe}/${entree.name}`;
    if (!entree.id) {
      fichiers.push(...(await listerFichiers(serviceClient, chemin)));
    } else {
      fichiers.push(chemin);
    }
  }
  return fichiers;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: visiteId } = await params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Rate limit: 30 suppressions par heure
    if (!(await checkRateLimit(`visite-delete:${user.id}`, 30, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    // Vérifier l'autorisation
    if (!(await canAccessVisite(supabase, user.id, visiteId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Charger la visite pour vérifier le statut (RLS appliquée)
    const { data: visite } = await supabase
      .from("visites")
      .select("id, statut, chantier_id, rapport_url")
      .eq("id", visiteId)
      .single();

    if (!visite) {
      return NextResponse.json({ error: "Visite introuvable" }, { status: 404 });
    }

    // Interdire la suppression d'une visite terminée
    if (visite.statut === "terminee") {
      return NextResponse.json(
        { error: "Impossible de supprimer une visite terminée" },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    // 1. Les écarts rattachés aux réponses de la visite. La clé étrangère
    //    `ecarts.reponse_id` n'est pas en cascade : sans cela, la suppression
    //    des réponses échouerait dès qu'un écart existe.
    const { data: reponses, error: reponsesError } = await serviceClient
      .from("reponses")
      .select("id")
      .eq("visite_id", visiteId);
    if (reponsesError) throw new Error(reponsesError.message);

    const reponseIds = (reponses ?? []).map((r) => r.id);
    if (reponseIds.length > 0) {
      const { error: ecartsError } = await serviceClient
        .from("ecarts")
        .delete()
        .in("reponse_id", reponseIds);
      if (ecartsError) throw new Error(ecartsError.message);
    }

    // 2. La visite — les réponses suivent (`on delete cascade`). Le résultat
    //    est vérifié : zéro ligne signifierait que rien n'a été supprimé.
    const { data: supprimees, error: deleteError } = await serviceClient
      .from("visites")
      .delete()
      .eq("id", visiteId)
      .select("id");
    if (deleteError) throw new Error(deleteError.message);
    if (!supprimees || supprimees.length === 0) {
      throw new Error("La visite n'a pas été supprimée (aucune ligne touchée)");
    }

    // 3. Le stockage : photos sous `<chantier>/<visite>/…`, et le rapport si un
    //    brouillon en avait déjà produit un. Un échec ici ne remet pas en cause
    //    la suppression — les données sont parties — mais il est journalisé.
    const avertissements: string[] = [];
    let photosSupprimees = 0;
    try {
      const fichiers = await listerFichiers(
        serviceClient,
        `${visite.chantier_id}/${visiteId}`,
      );
      if (fichiers.length > 0) {
        const { error: removeError } = await serviceClient.storage
          .from(BUCKET_PHOTOS)
          .remove(fichiers);
        if (removeError) throw new Error(removeError.message);
        photosSupprimees = fichiers.length;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[visite ${visiteId}] Photos non nettoyées :`, message);
      avertissements.push(`photos : ${message}`);
    }

    if (visite.rapport_url) {
      try {
        const chemin = extractRapportStoragePath(visite.rapport_url);
        const { error: removeError } = await serviceClient.storage
          .from("rapports")
          .remove([chemin]);
        if (removeError) throw new Error(removeError.message);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[visite ${visiteId}] Rapport non nettoyé :`, message);
        avertissements.push(`rapport : ${message}`);
      }
    }

    // Audit log
    await journaliser({
      userId: user.id,
      action: "delete_visite",
      resource: "visite",
      resourceId: visiteId,
      details: {
        chantier_id: visite.chantier_id,
        statut: visite.statut,
        reponses: reponseIds.length,
        photos_supprimees: photosSupprimees,
        ...(avertissements.length > 0 ? { avertissements } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Visite delete error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la visite" },
      { status: 500 }
    );
  }
}
