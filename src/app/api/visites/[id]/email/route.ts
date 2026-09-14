import { AvenantError, chargerPdfAvenant, lireAvenants } from "@/lib/supabase/avenant";
import { verifierRapportVisite } from "@/lib/utils/storage-reference";
import { requireApiUser } from "@/lib/supabase/require-api-user";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendRapport } from "@/lib/email/send-rapport";
import { canAccessVisite, canAccessChantier, getUserRole } from "@/lib/utils/security";
import { checkRateLimit } from "@/lib/rate-limit";
import { getLimits } from "@/lib/roles/limites";
import { journaliser } from "@/lib/audit";

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

    // Rate limit: 10 emails par heure
    if (!(await checkRateLimit(`visite-email:${user.id}`, 10, 60 * 60 * 1000))) {
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
    // Sélection explicite obligatoire : une demande invalide n’élargit jamais l’envoi.
    let selectedIds: string[] | null = null;
    let extraEmails: string[] = [];
    let referenceAttendue: string | null = null;
    let avenantsAttendus: string[] | null = null;
    try {
      const text = await request.text();
      if (text.length > 32768) return NextResponse.json({ error: "Demande trop volumineuse." }, { status: 413 });
      if (text) {
        const parsed = JSON.parse(text);
        referenceAttendue = typeof parsed?.rapportReference === "string" ? parsed.rapportReference : null;
        if (parsed?.avenantsIds !== undefined) {
          if (!Array.isArray(parsed.avenantsIds) || parsed.avenantsIds.some((v: unknown) => typeof v !== "string")) return NextResponse.json({ error: "Liste des avenants invalide." }, { status: 400 });
          avenantsAttendus = parsed.avenantsIds;
        }
        if (!Array.isArray(parsed?.destinataireIds) || parsed.destinataireIds.length > 50 || parsed.destinataireIds.some((id: unknown) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Sélection invalide");
        selectedIds = [...new Set<string>(parsed.destinataireIds)];
        if (parsed.extraEmails !== undefined) {
          if (!Array.isArray(parsed.extraEmails) || parsed.extraEmails.length > 50 || parsed.extraEmails.some((e: unknown) => typeof e !== "string" || e.length > 254 || /[\r\n]/.test(e) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))) throw new Error("Email invalide");
          extraEmails = [...new Set<string>(parsed.extraEmails.map((e: string) => e.trim().toLowerCase()))];
        }
      }
    } catch {
      return NextResponse.json({ error: "Demande invalide. Vérifiez les destinataires." }, { status: 400 });
    }

    if (selectedIds === null) return NextResponse.json({ error: "Sélection explicite des destinataires requise." }, { status: 400 });

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

    if (referenceAttendue !== visite.rapport_url) {
      return NextResponse.json({ error: "La version du rapport a changé. Rechargez la page avant l’envoi." }, { status: 409 });
    }

    if (!(await canAccessChantier(supabase, user.id, visite.chantier_id))) return NextResponse.json({ error: "Une affectation actuelle est requise pour envoyer le rapport." }, { status: 403 });
    const avenants = await lireAvenants(supabase, visiteId);
    const idsAvenants = avenants.map(a => a.id);
    if (JSON.stringify(avenantsAttendus ?? []) !== JSON.stringify(idsAvenants)) return NextResponse.json({ error: "L’historique des avenants a changé. Rechargez et vérifiez les pièces jointes avant l’envoi." }, { status: 409 });

    // Load chantier for address
    const { data: chantier } = await supabase
      .from("chantiers")
      .select("adresse")
      .eq("id", visite.chantier_id)
      .single();

    // Load destinataires du chantier
    const { data: allDestinataires, error: erreurDestinataires } = await supabase
      .from("destinataires")
      .select("*")
      .eq("chantier_id", visite.chantier_id);

    if (erreurDestinataires) return NextResponse.json({ error: "Liste des destinataires indisponible." }, { status: 503 });
    if (selectedIds.some(id => !(allDestinataires ?? []).some(d => d.id === id))) return NextResponse.json({ error: "La liste des destinataires a changé. Relisez votre sélection." }, { status: 409 });

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

    if (destinataires.length === 0 || destinataires.length > 50) {
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
    let storagePath: string;
    try { storagePath = verifierRapportVisite(visite.rapport_url, visite); }
    catch { return NextResponse.json({ error: "Le fichier ne correspond pas à cette visite. Régénérez le PDF." }, { status: 409 }); }
    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from("rapports")
      .download(storagePath);

    if (downloadError || !pdfBlob) {
      return NextResponse.json(
        { error: "Impossible de télécharger le PDF depuis le stockage" },
        { status: 500 }
      );
    }

    if (pdfBlob.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Les pièces jointes dépassent 25 Mo." }, { status: 422 });
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    let taillePieces = pdfBuffer.byteLength;
    const piecesAvenants: { filename: string; content: Buffer }[] = [];
    for (const avenant of avenants) {
      const content = await chargerPdfAvenant(supabase, avenant, visite.chantier_id);
      taillePieces += content.byteLength;
      if (taillePieces > 25 * 1024 * 1024) return NextResponse.json({ error: "Les pièces jointes dépassent 25 Mo. Téléchargez les rapports et avenants séparément." }, { status: 422 });
      piecesAvenants.push({ filename: `avenant_${avenant.numero}_${avenant.id}.pdf`, content });
    }
    const derniereLecture = await lireAvenants(supabase, visiteId);
    if (JSON.stringify(derniereLecture.map(a => a.id)) !== JSON.stringify(idsAvenants)) return NextResponse.json({ error: "Un avenant vient d’être ajouté. Vérifiez les pièces jointes avant l’envoi." }, { status: 409 });

    const tentativeId = crypto.randomUUID();
    if (!(await journaliser({ userId: user.id, action: "prepare_rapport_email", resource: "visite", resourceId: visiteId, details: { tentative_id: tentativeId, rapport_reference: referenceAttendue, avenants_ids: idsAvenants, destinataires: destinataires.map(d => d.email) } }))) return NextResponse.json({ error: "Journal de transmission indisponible. Aucun email n’a été envoyé." }, { status: 503 });

    const sentTo = await sendRapport(
      pdfBuffer,
      destinataires,
      chantier?.adresse ?? "Chantier",
      visite.date_visite,
      inspecteur?.nom,
      entreprise,
      piecesAvenants
    );

    const service = await createServiceClient();
    const { data: dossierMarque, error: marquageError } = await service.rpc("confirmer_envoi_rapport", {
      p_visite_id: visiteId, p_auteur_id: user.id, p_rapport_reference: referenceAttendue, p_dernier_avenant: idsAvenants.at(-1) ?? null,
    });
    if (marquageError || dossierMarque !== true) console.error("Email envoyé ; dossier modifié ou confirmation indisponible", { visiteId, code: marquageError?.code });

    // Audit log
    const traceConfirmee = await journaliser({
      userId: user.id,
      action: "send_rapport_email",
      resource: "visite",
      resourceId: visiteId,
      details: { tentative_id: tentativeId, sent_to: sentTo, count: sentTo.length, rapport_reference: referenceAttendue, avenants_ids: idsAvenants },
    });

    return NextResponse.json({
      sent_to: sentTo,
      count: sentTo.length,
      traceConfirmee,
      dossierAJour: dossierMarque === true && !marquageError,
    });
  } catch (err) {
    if (err instanceof AvenantError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email" },
      { status: 500 }
    );
  }
}
