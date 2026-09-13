import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { canAccessVisite, getUserRole } from "@/lib/utils/security";
import { getLimits } from "@/lib/roles/limites";
import { checkRateLimit } from "@/lib/rate-limit";
import { creerChargeurImagesPdf, ImagePdfInvalide } from "@/lib/supabase/pdf-images";
import { cheminRapportVisite } from "@/lib/utils/storage-reference";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: visiteId } = await params;

  try {
    const supabase = await createClient();

    // Verify auth
    const { user, response: authResponse } = await requireApiUser(supabase);
    if (authResponse) return authResponse;

    // Rate limit: 5 générations de PDF par heure
    if (!(await checkRateLimit(`pdf-gen:${user.id}`, 5, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    // Vérification d'autorisation
    if (!(await canAccessVisite(supabase, user.id, visiteId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Vérification limites plan
    const role = await getUserRole(supabase, user.id);
    const limits = getLimits(role ?? "invité");
    if (!limits.canGeneratePdf) {
      return NextResponse.json(
        { error: "La génération de rapports PDF est réservée aux abonnés. Passez à l'offre payante." },
        { status: 403 }
      );
    }

    // Load visite
    const { data: visite } = await supabase
      .from("visites")
      .select("*")
      .eq("id", visiteId)
      .single();

    if (!visite) {
      return NextResponse.json(
        { error: "Visite introuvable" },
        { status: 404 }
      );
    }

    if (visite.statut !== "terminee") {
      return NextResponse.json(
        { error: "La visite doit etre terminee pour generer le PDF" },
        { status: 400 }
      );
    }

    // Charger toutes les données en parallèle
    const [
      { data: chantier },
      { data: inspecteur },
      { data: reponses },
      { data: ecarts },
      { data: destinataires },
      { data: entreprise },
      signatureDataUri,
    ] = await Promise.all([
      supabase.from("chantiers").select("*").eq("id", visite.chantier_id).single(),
      supabase.from("profiles").select("nom, email").eq("id", visite.inspecteur_id).single(),
      supabase.from("reponses").select("*, points_controle:point_controle_id(intitule, critere, objet)").eq("visite_id", visiteId),
      supabase.from("ecarts").select("*").eq("chantier_id", visite.chantier_id).order("created_at", { ascending: false }),
      supabase.from("destinataires").select("*").eq("chantier_id", visite.chantier_id),
      supabase.from("entreprises").select("nom, logo_url, adresse, npa, ville, telephone, email").limit(1).maybeSingle(),
      (async () => {
        try {
          const fs = await import("fs/promises");
          const path = await import("path");
          const sigPath = path.join(process.cwd(), "public", "signature-inspecteur.png");
          const sigBuffer = await fs.readFile(sigPath);
          return `data:image/png;base64,${sigBuffer.toString("base64")}`;
        } catch {
          return null;
        }
      })(),
    ]);

    const chargerImage = creerChargeurImagesPdf(supabase);
    const logoSigne = await chargerImage(entreprise?.logo_url, "rapports");
    const reponsesSource = reponses ?? [];
    const photosAPlat: string[] = reponsesSource.flatMap((r) => r.photos ?? []);
    const photosSignees: (string | null)[] = [];
    // Séquentiel pour borner la mémoire et le cumul des octets.
    for (const photo of photosAPlat) photosSignees.push(await chargerImage(photo, "visite-photos"));
    let curseurPhoto = 0;
    const reponsesSignees = reponsesSource.map((r) => {
      const nb = (r.photos ?? []).length;
      const photos = photosSignees
        .slice(curseurPhoto, curseurPhoto + nb)
        .filter((u): u is string => !!u);
      curseurPhoto += nb;
      return { ...r, photos };
    });

    // Dynamically import react-pdf to avoid SSR issues
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { RapportVisite } = await import(
      "@/components/pdf/rapport-visite"
    );

    const pdfBuffer = await renderToBuffer(
      RapportVisite({
        chantier: chantier!,
        visite,
        inspecteur: inspecteur ?? { nom: "Inconnu", email: "" },
        reponses: reponsesSignees,
        ecarts: ecarts ?? [],
        destinataires: destinataires ?? [],
        entrepriseNom: entreprise?.nom ?? null,
        entrepriseLogoUrl: logoSigne,
        entrepriseAdresse: entreprise
          ? [entreprise.adresse, entreprise.npa, entreprise.ville]
              .filter(Boolean)
              .join(", ") || null
          : null,
        entrepriseTelephone: entreprise?.telephone ?? null,
        entrepriseEmail: entreprise?.email ?? null,
        signatureDataUri,
      })
    );

    // Upload to Supabase Storage
    const serviceClient = await createServiceClient();
    const dateStr = visite.date_visite.replace(/-/g, "");
    const filename = `rapport_${dateStr}_${visiteId.slice(0, 8)}.pdf`;
    const storagePath = cheminRapportVisite(visite.chantier_id, visiteId);

    const { error: uploadError } = await serviceClient.storage
      .from("rapports")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    // Stocker le chemin (pas la public URL) — bucket privé
    const { data: visitesMaj, error: erreurMaj } = await serviceClient
      .from("visites")
      .update({ rapport_url: storagePath, updated_at: new Date().toISOString() })
      .eq("id", visiteId).select("id");
    if (erreurMaj || visitesMaj?.length !== 1) throw new Error("Référence du rapport non enregistrée");

    // Générer une signed URL valide 1 heure pour usage immédiat
    const { data: signedData, error: signatureError } = await supabase.storage
      .from("rapports")
      .createSignedUrl(storagePath, 3600);

    if (signatureError || !signedData?.signedUrl) throw new Error("Rapport généré mais accès indisponible");
    return NextResponse.json({ url: signedData.signedUrl, filename });
  } catch (err) {
    if (err instanceof ImagePdfInvalide) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
