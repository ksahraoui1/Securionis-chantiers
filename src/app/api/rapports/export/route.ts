import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserRole } from "@/lib/utils/security";
import JSZip from "jszip";
import { verifierRapportVisite } from "@/lib/utils/storage-reference";

export const maxDuration = 300; // 5 minutes

/**
 * Exporte tous les rapports de tous les chantiers en ZIP.
 * Réservé aux administrateurs uniquement.
 * GET /api/rapports/export
 */
export async function GET(request: NextRequest) {
  try {
    // Authentification
    const supabase = await createClient();
    const { user, response: authResponse } = await requireApiUser(supabase);
    if (authResponse) return authResponse;

  // Export lourd (ZIP de tous les rapports) : 5 par heure
  if (!(await checkRateLimit(`rapports-export:${user.id}`, 5, 60 * 60 * 1000))) {
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

    // Récupérer toutes les visites avec rapports
    const { data: visites, error: visitesError } = await supabase
      .from("visites")
      .select(
        `
        id,
        rapport_url,
        date_visite,
        chantier_id,
        chantiers (
          id,
          nom
        )
      `
      )
      .not("rapport_url", "is", null);

    if (visitesError) {
      console.error("Supabase error:", visitesError);
      return NextResponse.json(
        { error: `Erreur lecture base: ${visitesError.message}` },
        { status: 500 }
      );
    }

    console.log(`Visites avec rapports trouvées: ${visites?.length || 0}`);

    if (!visites || visites.length === 0) {
      return NextResponse.json(
        { error: "Aucun rapport trouvé" },
        { status: 404 }
      );
    }

    // Créer le ZIP avec JSZip
    const zip = new JSZip();

    // Télécharger et ajouter chaque rapport au ZIP
    let addedCount = 0;
    const echecs: string[] = [];
    for (const visite of visites) {
      if (!visite.rapport_url) continue;

      try {
        const storagePath = verifierRapportVisite(visite.rapport_url, visite);
        const parametres = { signal: AbortSignal.timeout(30_000), redirect: "error" as const };
        const { data: rapport, error: erreurRapport } = await supabase.storage
          .from("rapports").download(storagePath, {}, parametres);
        if (erreurRapport || !rapport) throw new Error("Rapport inaccessible");
        const buffer = await rapport.arrayBuffer();
        const filename = `rapport_${visite.id}.pdf`;

        // Chemin dans le ZIP: chantier/date/rapport.pdf
        const chantier = visite.chantiers as any;
        const safeChantierId = (chantier?.id || "unknown").replace(
          /[^a-z0-9-]/gi,
          "_"
        );
        const safeVisiteDate = visite.date_visite.substring(0, 10); // YYYY-MM-DD

        const zipPath = `${safeChantierId}-${chantier?.nom || "Sans chantier"}/${safeVisiteDate}/${filename}`;

        zip.file(zipPath, buffer);
        addedCount++;
      } catch (err) {
        echecs.push(`Visite ${visite.id} : rapport inaccessible ou référence invalide`);
        console.warn(`Rapport non exporté pour la visite ${visite.id}:`, err);
      }
    }

    console.log(
      `Rapports trouvés: ${visites.length}, ajoutés: ${addedCount}`
    );

    if (addedCount === 0) {
      return NextResponse.json(
        { error: "Aucun rapport n\'a pu être téléchargé" },
        { status: 500 }
      );
    }

    zip.file("MANIFESTE.txt", `${addedCount} rapport(s) inclus sur ${visites.length}.\n${echecs.join("\n")}`);

    // Générer le ZIP et retourner
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    const response = new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="rapports-export-${new Date().toISOString().split("T")[0]}.zip"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    console.log("ZIP rapports complété");

    return response;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Erreur export rapports:", errMsg, err);
    return NextResponse.json(
      { error: `Erreur serveur: ${errMsg}` },
      { status: 500 }
    );
  }
}
