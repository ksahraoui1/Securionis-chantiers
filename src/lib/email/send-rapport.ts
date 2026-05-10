import { Resend } from "resend";
import { getResendApiKey, getResendFromEmail } from "@/lib/env";
import { escapeHtml } from "@/lib/utils/security";

function getResend() {
  return new Resend(getResendApiKey());
}

interface EntrepriseInfo {
  nom: string;
  adresse?: string | null;
  npa?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export async function sendRapport(
  pdfBuffer: Buffer,
  destinataires: { nom: string; email: string }[],
  chantierAdresse: string,
  dateVisite: string,
  inspecteurNom?: string,
  entreprise?: EntrepriseInfo | null
): Promise<string[]> {
  const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 Mo
  if (pdfBuffer.byteLength > MAX_PDF_SIZE) {
    throw new Error("Le PDF est trop volumineux pour l'envoi par email");
  }

  const dateFormatted = new Date(dateVisite).toLocaleDateString("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = `Rapport de visite — ${chantierAdresse} — ${dateFormatted}`;
  const filename = `rapport_visite_${dateVisite}.pdf`;

  const allEmails = destinataires
    .map((d) => d.email.trim().replace(/^\.+/, ""))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (allEmails.length === 0) {
    throw new Error("Aucune adresse email valide parmi les destinataires");
  }

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: getResendFromEmail(),
      to: allEmails,
      subject,
      html: buildEmailHtml(dateFormatted, inspecteurNom, entreprise),
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    });

    if (result.error) {
      console.error("Resend error:", result.error);
      throw new Error(`Resend a refusé l'envoi : ${result.error.message}`);
    }

    return allEmails;
  } catch (err) {
    console.error("Failed to send email to all recipients:", err);
    throw err instanceof Error ? err : new Error("Erreur lors de l'envoi de l'email");
  }
}

function buildEmailHtml(
  dateFormatted: string,
  inspecteurNom?: string,
  entreprise?: EntrepriseInfo | null
): string {
  let signature = "";

  if (entreprise) {
    const lines: string[] = [];
    lines.push(`<strong>${escapeHtml(entreprise.nom)}</strong>`);
    if (inspecteurNom) lines.push(escapeHtml(inspecteurNom));
    if (entreprise.adresse) {
      const adresseLine = [entreprise.adresse, entreprise.npa, entreprise.ville]
        .filter(Boolean)
        .join(" ");
      lines.push(escapeHtml(adresseLine));
    }
    if (entreprise.telephone) lines.push(escapeHtml(entreprise.telephone));
    if (entreprise.email) lines.push(escapeHtml(entreprise.email));

    signature = `
      <hr style="border:none;border-top:1px solid #999;margin:20px 0"/>
      <p style="margin:0">${lines.join("<br/>")}</p>`;
  } else if (inspecteurNom) {
    signature = `
      <hr style="border:none;border-top:1px solid #999;margin:20px 0"/>
      <p style="margin:0">${escapeHtml(inspecteurNom)}</p>`;
  }

  return `
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint le rapport de visite du ${dateFormatted}.</p>
    <p>Excellente journée<br/>Portez-vous bien<br/>Bien à vous</p>
    ${signature}
  `;
}
