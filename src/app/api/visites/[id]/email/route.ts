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

    // Optional body:
    //   - destinataireIds?: string[]  — restreindre aux destinataires sélectionnés du chantier
    //   - extraEmails?: string[]      — emails ad-hoc hors liste chantier
    // Si destinataireIds absent : envoi à tous les destinataires du chantier (rétro-compat).
    let selectedIds: string[] | null = null;
    let extraEmails: string[] = [];
    try {
      const text = await request.text();
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.destinataireIds)) {
          selectedIds = parsed.destinataireIds.filter(
            (id: unknown): id is string => typeof id === "string",
          );
        }
        if (Array.isArray(parsed?.extraEmails)) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          extraEmails = parsed.extraEmails
            .filter((e: unknown): e is string => typeof e === "string")
            .map((e: string) => e.trim())
            .filter((e: string) => e.length > 0 && !/[\r\n]/.test(e) && emailRegex.test(e));
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

    // Filtrer si une sélection a été demandée (anti-injection : on n'envoie qu'à des destinataires liés au chantier)
    const baseDestinataires = selectedIds
      ? (allDestinataires ?? []).filter((d) => selectedIds!.includes(d.id))
      : (allDestinataires ?? []);

    // Construire des destinataires virtuels pour les emails ad-hoc (déduplication sur l'email)
    const knownEmails = new Set(baseDestinataires.map((d) => d.email.toLowerCase()));
    const adHocDestinataires = extraEmails
      .filter((email) => !knownEmails.has(email.toLowerCase()))
      .map((email) => ({ nom: email, email, organisation: null }));

    const destinataires = [...baseDestinataires, ...adHocDestinataires];

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
      resource: "visite",
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
