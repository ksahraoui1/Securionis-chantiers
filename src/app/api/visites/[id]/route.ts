import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { cheminRapportVisite } from "@/lib/utils/storage-reference";
import { checkRateLimit } from "@/lib/rate-limit";
import { journaliser } from "@/lib/audit";

/** L'autorisation, le statut et les lignes sont traités atomiquement en base.
 * Les fichiers dérivés de l'identité supprimée sont nettoyés après commit.
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

    const { user, response: authResponse } = await requireApiUser(supabase);
    if (authResponse) return authResponse;

    // Rate limit: 30 suppressions par heure
    if (!(await checkRateLimit(`visite-delete:${user.id}`, 30, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    const { data: visite, error: suppressionError } = await supabase.rpc(
      "supprimer_visite_brouillon", { p_visite_id: visiteId },
    );
    if (suppressionError) {
      if (suppressionError.code === "42501") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
      if (suppressionError.code === "22023") return NextResponse.json({ error: "Impossible de supprimer une visite terminée" }, { status: 400 });
      throw new Error("Suppression de visite impossible");
    }
    if (!visite || visite.id !== visiteId) throw new Error("Suppression non confirmée");
    const serviceClient = await createServiceClient();

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
        const chemin = cheminRapportVisite(visite.chantier_id, visiteId);
        // Les anciens noms tronquent l'UUID. Ne jamais effacer une ancienne
        // référence modifiable : conserver l'orphelin pour une revue séparée.
        if (visite.rapport_url !== chemin) throw new Error("Ancien rapport conservé pour nettoyage contrôlé");
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
        reponses: visite.reponses,
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
