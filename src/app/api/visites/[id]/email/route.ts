import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendRapport } from "@/lib/email/send-rapport";
import { canAccessVisite, getUserRole, extractRapportStoragePath } from "@/lib/utils/security";
import { checkRateLimit } from "@/lib/rate-limit";
import { getLimits } from "@/lib/stripe/limits";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: visiteId } = await params;

  try {
    const supabase = await createClient();

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    // Rate limit: 10 emails par heure
    if (!checkRateLimit(`visite-email:${user.id}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    // Vérification d'autorisation
    if (!(await canAccessVisite(supabase, user.id, visiteId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Vérification limites plan
    const role = await getUserRole(supabase, user.id);
    const limits = getLimits(role ?? "invité");
    if (!limits.canSendEmail) {
      return NextResponse.json(
        { error: "L'envoi de rapports par email est réservé aux abonnés. Passez à l'offre payante." },
        { status: 403 }
      );
    }

    // Optional body: { destinataireIds?: string[] } pour restreindre l'envoi
    // Si absent, envoie à tous les destinataires du chantier (comportement historique).
    let selectedIds: string[] | null = null;
    try {
      const text = await request.text();
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.destinataireIds)) {
          selectedIds = parsed.destinataireIds.filter(
            (id: unknown): id is string => typeof id === "string",
          );
        }
      }
    } catch {
      // Body absent ou invalide → fallback à tous
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

    if (!visite.rapport_url) {
      return NextResponse.json(
        { error: "Le PDF doit etre genere avant l'envoi par email" },
        { status: 400 }
      );
    }

    // Load chantier for address
    const { data: chantier } = await supabase
      .from("chantiers")
      .select("adresse")
      .eq("id", visite.chantier_id)
      .single();

    // Load destinataires du chantier
    const { data: allDestinataires } = await supabase
      .from("destinataires")
      .select("*")
      .eq("chantier_id", visite.chantier_id);

    if (!allDestinataires || allDestinataires.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire configure pour ce chantier" },
        { status: 400 }
      );
    }

    // Filtrer si une sélection a été demandée (anti-injection : on n'envoie qu'à des destinataires liés au chantier)
    const destinataires = selectedIds
      ? allDestinataires.filter((d) => selectedIds!.includes(d.id))
      : allDestinataires;

    if (destinataires.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire sélectionné" },
        { status: 400 }
      );
    }

    // Load inspecteur profile + entreprise
    const { data: inspecteur } = await supabase
      .from("profiles")
      .select("nom, entreprise_id")
      .eq("id", visite.inspecteur_id)
      .single();

    let entreprise = null;
    if (inspecteur?.entreprise_id) {
      const { data } = await supabase
        .from("entreprises")
        .select("nom, adresse, npa, ville, telephone, email")
        .eq("id", inspecteur.entreprise_id)
        .single();
      entreprise = data;
    }

    // Télécharger les octets du PDF depuis le storage (bucket privé)
    const serviceClient = await createServiceClient();
    const storagePath = extractRapportStoragePath(visite.rapport_url);
    const { data: pdfBlob, error: downloadError } = await serviceClient.storage
      .from("rapports")
      .download(storagePath);

    if (downloadError || !pdfBlob) {
      return NextResponse.json(
        { error: "Impossible de télécharger le PDF depuis le stockage" },
        { status: 500 }
      );
    }

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    const sentTo = await sendRapport(
      pdfBuffer,
      destinataires,
      chantier?.adresse ?? "Chantier",
      visite.date_visite,
      inspecteur?.nom,
      entreprise
    );

    // Update visite
    await supabase
      .from("visites")
      .update({ email_envoye: true })
      .eq("id", visiteId);

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "send_rapport_email",
      resource_type: "visite",
      resource_id: visiteId,
      details: { sent_to: sentTo, count: sentTo.length },
    });

    return NextResponse.json({
      sent_to: sentTo,
      count: sentTo.length,
    });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email" },
      { status: 500 }
    );
  }
}
