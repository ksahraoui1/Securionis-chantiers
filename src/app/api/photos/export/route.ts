import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserRole, isAllowedSupabaseUrl } from "@/lib/utils/security";
import JSZip from "jszip";
import { signerUrl } from "@/lib/utils/url-signee";

export const maxDuration = 300; // 5 minutes

/**
 * Exporte toutes les photos de tous les chantiers en ZIP.
 * Réservé aux administrateurs uniquement.
 * GET /api/photos/export
 */
export async function GET(request: NextRequest) {
  try {
    // Authentification
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

  // Export lourd (ZIP de toutes les photos) : 5 par heure
  if (!(await checkRateLimit(`photos-export:${user.id}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429 }
    );
  }

    // Vérifier que c'est un admin
    const role = await getUserRole(supabase, user.id);
    if (role !== "administrateur") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    // Récupérer toutes les réponses avec les photos
    const { data: reponses, error: reponsesError } = await supabase
      .from("reponses")
      .select(
        `
        id,
        photos,
        visite_id,
        point_controle_id,
        visites (
          id,
          date_visite,
          chantier_id,
          chantiers (
            id,
            nom
          )
        ),
        points_controle (
          id,
          intitule
        )
      `
      )
      .not("photos", "is", null);

    if (reponsesError) {
      console.error("Supabase error:", reponsesError);
      return NextResponse.json(
        { error: `Erreur lecture base: ${reponsesError.message}` },
        { status: 500 }
      );
    }

    console.log(`Réponses trouvées: ${reponses?.length || 0}`);

    if (!reponses || reponses.length === 0) {
      return NextResponse.json(
        { error: "Aucune photo trouvée" },
        { status: 404 }
      );
    }

    // Créer le ZIP avec JSZip
    const zip = new JSZip();

    // Récupérer toutes les photos uniques
    const photoUrls: string[] = [];
    const photoMetadata: Map<
      string,
      {
        chantierId: string;
        cantierNom: string;
        visiteId: string;
        visiteDate: string;
        pointControleId: string;
        pointControleIntitule: string;
      }
    > = new Map();

    for (const reponse of reponses) {
      if (
        Array.isArray(reponse.photos) &&
        reponse.visites &&
        reponse.points_controle
      ) {
        const visite = reponse.visites as any;
        const chantier = visite.chantiers;
        const point = reponse.points_controle as any;

        for (const photoUrl of reponse.photos) {
          if (!photoUrls.includes(photoUrl)) {
            photoUrls.push(photoUrl);
            photoMetadata.set(photoUrl, {
              chantierId: chantier?.id || "unknown",
              cantierNom: chantier?.nom || "Sans chantier",
              visiteId: visite?.id || "unknown",
              visiteDate: visite?.date_visite || "unknown",
              pointControleId: point?.id || "unknown",
              pointControleIntitule: point?.intitule || "Sans point",
            });
          }
        }
      }
    }

    // Télécharger et ajouter chaque photo au ZIP
    let addedCount = 0;
    for (const photoUrl of photoUrls) {
      const metadata = photoMetadata.get(photoUrl);
      if (!metadata) continue;

      // Anti-SSRF : `reponses.photos` est modifiable par un inspecteur via
      // l'API REST ; on n'accepte que l'hôte Supabase du projet.
      if (!isAllowedSupabaseUrl(photoUrl)) {
        console.warn("URL de photo refusée (hors Supabase)");
        continue;
      }

      try {
        // Le bucket est privé (SEC-03) : signer avant de télécharger.
        const urlPhotoSignee = await signerUrl(supabase, photoUrl);
        if (!urlPhotoSignee) {
          console.warn("Signature impossible pour une photo");
          continue;
        }
        const response = await fetch(urlPhotoSignee, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          console.warn(`Impossible de télécharger: ${photoUrl}`);
          continue;
        }

        const buffer = await response.arrayBuffer();

        // Extraire le nom du fichier
        const urlObj = new URL(photoUrl);
        const filename = urlObj.pathname.split("/").pop() || "photo.jpg";

        // Chemin dans le ZIP: chantier/visite/point-controle/filename
        const safeChantierId = metadata.chantierId.replace(/[^a-z0-9-]/gi, "_");
        const safeVisiteDate = metadata.visiteDate.substring(0, 10); // YYYY-MM-DD
        const safePointId = metadata.pointControleId.replace(/[^a-z0-9-]/gi, "_");

        const zipPath = `${safeChantierId}-${metadata.cantierNom}/${safeVisiteDate}/${safePointId}-${metadata.pointControleIntitule.substring(0, 50)}/${filename}`;

        zip.file(zipPath, buffer);
        addedCount++;
      } catch (err) {
        console.warn(`Erreur téléchargement photo ${photoUrl}:`, err);
      }
    }

    console.log(`Photos trouvées: ${photoUrls.length}, ajoutées: ${addedCount}`);

    if (addedCount === 0) {
      return NextResponse.json(
        { error: "Aucune photo n\'a pu être téléchargée" },
        { status: 500 }
      );
    }

    // Générer le ZIP et retourner
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    const response = new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="photos-export-${new Date().toISOString().split("T")[0]}.zip"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    console.log("ZIP export complété");

    return response;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Erreur export photos:", errMsg, err);
    return NextResponse.json(
      { error: `Erreur serveur: ${errMsg}` },
      { status: 500 }
    );
  }
}
