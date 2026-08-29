import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessChantier, getUserRole } from "@/lib/utils/security";
import { getLimits } from "@/lib/roles/limites";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chargerComparaison,
  lireCapturePng,
  nomFichierComparaison,
} from "@/lib/utils/comparaison-rapport";

// La composition du PDF embarque une capture pleine résolution
export const maxDuration = 60;

/**
 * POST /api/comparaisons/[id]/pdf
 * FormData : { image: File (PNG de la vue) }
 *
 * Rend le rapport de comparaison des plans PE / EXE. Les annotations sont
 * relues en base — le navigateur ne fournit que l'image de la vue.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comparaisonId } = await params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Rate limit : 10 rapports de comparaison par heure
    if (!checkRateLimit(`comparaison-pdf:${user.id}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez plus tard." },
        { status: 429 }
      );
    }

    const role = await getUserRole(supabase, user.id);
    if (!getLimits(role ?? "invité").canGeneratePdf) {
      return NextResponse.json(
        {
          error:
            "La génération de rapports PDF est réservée aux abonnés. Passez à l'offre payante.",
        },
        { status: 403 }
      );
    }

    const donnees = await chargerComparaison(supabase, comparaisonId, user.id);
    if (!donnees) {
      return NextResponse.json(
        { error: "Comparaison introuvable" },
        { status: 404 }
      );
    }

    if (!(await canAccessChantier(supabase, user.id, donnees.chantierId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const formulaire = await request.formData();
    const capture = await lireCapturePng(formulaire.get("image"));
    if ("erreur" in capture) {
      return NextResponse.json({ error: capture.erreur }, { status: 400 });
    }

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { RapportComparaison } = await import(
      "@/components/pdf/rapport-comparaison"
    );

    const maintenant = new Date();
    const pdf = await renderToBuffer(
      RapportComparaison({
        chantierNom: donnees.chantierNom,
        chantierAdresse: donnees.chantierAdresse,
        planPE: donnees.planPE,
        planEXE: donnees.planEXE,
        image: { data: capture.buffer, format: "png" },
        annotations: donnees.annotations,
        dateJour: maintenant.toLocaleDateString("fr-CH"),
        dateGeneration: `${maintenant.toLocaleDateString(
          "fr-CH"
        )} à ${maintenant.toLocaleTimeString("fr-CH", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        signePar: donnees.signePar,
        entrepriseNom: donnees.entrepriseNom,
      })
    );

    const nom = nomFichierComparaison(donnees, "pdf");

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nom}"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    console.error("Comparaison PDF error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de la génération du rapport",
      },
      { status: 500 }
    );
  }
}
