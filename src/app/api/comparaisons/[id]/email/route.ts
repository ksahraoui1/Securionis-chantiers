import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { canAccessChantier, getUserRole } from "@/lib/utils/security";
import { getLimits } from "@/lib/roles/limites";
import { checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/utils/security";
import { getAppUrl, getResendApiKey, getResendFromEmail } from "@/lib/env";
import {
  chargerComparaison,
  lireCapturePng,
  nomFichierComparaison,
} from "@/lib/utils/comparaison-rapport";
import { journaliser } from "@/lib/audit";

export const maxDuration = 60;

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGUEUR_MAX_MESSAGE = 2000;

/**
 * POST /api/comparaisons/[id]/email
 * FormData : { to: string, message?: string, image: File (PNG de la vue) }
 *
 * Partage une comparaison de plans : lien direct vers la vue et capture PNG
 * en pièce jointe.
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

    // Rate limit : 10 partages par heure
    if (!(await checkRateLimit(`comparaison-email:${user.id}`, 10, 60 * 60 * 1000))) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez plus tard." },
        { status: 429 }
      );
    }

    const role = await getUserRole(supabase, user.id);
    if (!getLimits(role ?? "invité").canSendEmail) {
      return NextResponse.json(
        {
          error:
            "L'envoi d'emails est réservé aux abonnés. Passez à l'offre payante.",
        },
        { status: 403 }
      );
    }

    const formulaire = await request.formData();
    const destinataire = String(formulaire.get("to") ?? "").trim();
    const message = String(formulaire.get("message") ?? "").trim();

    if (!EMAIL_VALIDE.test(destinataire)) {
      return NextResponse.json(
        { error: "Adresse email invalide" },
        { status: 400 }
      );
    }
    if (message.length > LONGUEUR_MAX_MESSAGE) {
      return NextResponse.json(
        { error: "Message trop long (2000 caractères maximum)" },
        { status: 400 }
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

    const capture = await lireCapturePng(formulaire.get("image"));
    if ("erreur" in capture) {
      return NextResponse.json({ error: capture.erreur }, { status: 400 });
    }

    // Le lien recharge exactement le même couple de plans
    const lien =
      `${getAppUrl()}/chantiers/${donnees.chantierId}/comparaison` +
      `?pe=${encodeURIComponent(donnees.planPE.id)}` +
      `&exe=${encodeURIComponent(donnees.planEXE.id)}`;

    // Nettoyage du nom d'expéditeur (injection d'en-têtes email)
    const expediteur =
      donnees.signePar.replace(/[<>"'\r\n]/g, "").trim() ||
      "Securionis Chantiers";

    const versionPE = donnees.planPE.version
      ? `V${donnees.planPE.version}`
      : "sans version";
    const versionEXE = donnees.planEXE.version
      ? `V${donnees.planEXE.version}`
      : "sans version";

    const resend = new Resend(getResendApiKey());

    const resultat = await resend.emails.send({
      from: `${expediteur} <${getResendFromEmail()}>`,
      to: [destinataire],
      subject: `Comparaison de plans — ${donnees.chantierNom}`,
      html: `
        <p><strong>Ne veuille pas répondre à cette email ! Utilisez : ks.aigle@gmail.com</strong></p>
        <p>Bonjour,</p>
        <p>
          Voici la comparaison des plans du chantier
          <strong>${escapeHtml(donnees.chantierNom)}</strong>.
        </p>
        <ul>
          <li>Plan d'enquête publique (PE) : ${escapeHtml(
            donnees.planPE.nom
          )} — ${versionPE} (${escapeHtml(donnees.planPE.date)}), page ${
            donnees.planPE.page
          }</li>
          <li>Plan d'exécution (EXE) : ${escapeHtml(
            donnees.planEXE.nom
          )} — ${versionEXE} (${escapeHtml(donnees.planEXE.date)}), page ${
            donnees.planEXE.page
          }</li>
          <li>Différences annotées : ${donnees.annotations.length}</li>
        </ul>
        ${
          message
            ? `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`
            : ""
        }
        <p>La capture de la comparaison est jointe à cet email.</p>
        <p><a href="${escapeHtml(lien)}">Ouvrir la comparaison dans l'application</a></p>
        <p style="color:#6b7280;font-size:12px">
          Le lien n'est accessible qu'aux utilisateurs autorisés sur ce chantier.
        </p>
        <br>
        <p>Cordialement,<br>${escapeHtml(expediteur)}${
          donnees.entrepriseNom ? `<br>${escapeHtml(donnees.entrepriseNom)}` : ""
        }</p>
      `,
      attachments: [
        {
          filename: nomFichierComparaison(donnees, "png"),
          content: capture.buffer,
        },
      ],
    });

    if (resultat.error) {
      console.error("Resend error:", resultat.error);
      return NextResponse.json(
        { error: `Resend a refusé l'envoi : ${resultat.error.message}` },
        { status: 502 }
      );
    }

    await journaliser({
      userId: user.id,
      action: "send_comparaison_email",
      resource: "comparaisons",
      resourceId: comparaisonId,
      details: {
        sent_to: destinataire,
        chantier_id: donnees.chantierId,
        annotations: donnees.annotations.length,
      },
    });

    return NextResponse.json({ success: true, id: resultat.data?.id });
  } catch (err) {
    console.error("Comparaison email error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erreur lors de l'envoi de l'email",
      },
      { status: 500 }
    );
  }
}
