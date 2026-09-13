import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { canAccessVisite, canAccessChantier, getUserRole } from "@/lib/utils/security";
import { getLimits } from "@/lib/roles/limites";
import { checkRateLimit } from "@/lib/rate-limit";
import { creerChargeurImagesPdf, ImagePdfInvalide } from "@/lib/supabase/pdf-images";
import { enregistrerVersionRapport, nouvelleVersionRapport, PublicationRapportError } from "@/lib/supabase/rapport-version";

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

    if (!(await canAccessChantier(supabase, user.id, visite.chantier_id))) {
      return NextResponse.json({ error: "Une affectation actuelle au chantier est requise." }, { status: 403 });
    }
    let body: { motif?: unknown; rapportReference?: unknown } = {};
    const texte = await request.text();
    if (texte.length > 4096) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
    try { if (texte) body = JSON.parse(texte); } catch {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const motif = body && typeof body.motif === "string" ? body.motif.trim() : "";
    if (((visite.rapport_url || motif) && motif.length < 5) || motif.length > 1000) {
      return NextResponse.json({ error: "Indiquez le motif de cette nouvelle version (5 à 1 000 caractères)." }, { status: 400 });
    }
    if ((body?.rapportReference ?? null) !== visite.rapport_url) {
      return NextResponse.json({ error: "La version du rapport a changé. Rechargez la page." }, { status: 409 });
    }
    const versionId = nouvelleVersionRapport();

    // Charger toutes les données en parallèle
    const [
      { data: chantier },
      { data: inspecteur },
      { data: reponses },
      { data: ecarts },
      { data: destinataires },
    ] = await Promise.all([
      supabase.from("chantiers").select("*").eq("id", visite.chantier_id).single(),
      supabase.from("profiles").select("nom, email, entreprise_id").eq("id", visite.inspecteur_id).single(),
      supabase.from("reponses").select("*, points_controle:point_controle_id(intitule, critere, objet)").eq("visite_id", visiteId),
      supabase.from("ecarts").select("*").eq("chantier_id", visite.chantier_id).order("created_at", { ascending: false }),
      supabase.from("destinataires").select("*").eq("chantier_id", visite.chantier_id),
    ]);

    if (!chantier || !inspecteur || reponses === null || ecarts === null || destinataires === null) {
      throw new Error("Données du rapport indisponibles");
    }
    let entreprise = null;
    if (inspecteur.entreprise_id) {
      const resultatEntreprise = await supabase.from("entreprises")
        .select("nom, logo_url, adresse, npa, ville, telephone, email")
        .eq("id", inspecteur.entreprise_id).single();
      if (resultatEntreprise.error) throw new Error("Entreprise du rapport indisponible");
      entreprise = resultatEntreprise.data;
    }
    const source = { chantier, visite, inspecteur, reponses, ecarts, destinataires, entreprise, versionId };
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
        versionId,
      })
    );

    const serviceClient = await createServiceClient();
    const filename = `rapport_${visite.date_visite}_${versionId}.pdf`;
    const { chemin: storagePath, sha256 } = await enregistrerVersionRapport(serviceClient, {
      versionId, visiteId, chantierId: visite.chantier_id, auteurId: user.id,
      referenceAttendue: visite.rapport_url, motif: motif || "Première génération du rapport",
      source, pdf: pdfBuffer,
    });

    // Générer une signed URL valide 1 heure pour usage immédiat
    const { data: signedData, error: signatureError } = await supabase.storage
      .from("rapports")
      .createSignedUrl(storagePath, 3600);

    if (signatureError || !signedData?.signedUrl) throw new Error("Rapport généré mais accès indisponible");
    return NextResponse.json({ url: signedData.signedUrl, filename, versionId, sha256, reference: storagePath });
  } catch (err) {
    if (err instanceof PublicationRapportError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ImagePdfInvalide) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
