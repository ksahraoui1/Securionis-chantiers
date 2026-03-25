import { Resend } from "resend";
import { getResendApiKey, getResendFromEmail } from "@/lib/env";

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
  rapportUrl: string,
  destinataires: { nom: string; email: string }[],
  chantierAdresse: string,
  dateVisite: string,
  inspecteurNom?: string,
  entreprise?: EntrepriseInfo | null
): Promise<string[]> {
  // SSRF protection: only allow Supabase storage URLs
  const parsedUrl = new URL(rapportUrl);
  if (!parsedUrl.hostname.endsWith("supabase.co") && !parsedUrl.hostname.endsWith("supabase.in")) {
    throw new Error("URL de rapport non autorisée");
  }

  const pdfResponse = await fetch(rapportUrl, { signal: AbortSignal.timeout(30000) });
  if (!pdfResponse.ok) {
    throw new Error("Impossible de telecharger le PDF depuis le stockage");
  }
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

  const dateFormatted = new Date(dateVisite).toLocaleDateString("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = `Rapport de visite — ${chantierAdresse} — ${dateFormatted}`;
  const filename = `rapport_visite_${dateVisite}.pdf`;

  const sentTo: string[] = [];

  for (const dest of destinataires) {
    try {
      const resend = getResend();
      await resend.emails.send({
        from:
          getResendFromEmail(),
        to: dest.email,
        subject,
        html: buildEmailHtml(dateFormatted, inspecteurNom, entreprise),
        attachments: [
          {
            filename,
            content: pdfBuffer,
          },
        ],
      });

      sentTo.push(dest.email);
    } catch (err) {
      console.error(`Failed to send email to ${dest.email}:`, err);
    }
  }

  if (sentTo.length === 0) {
    throw new Error("Aucun email n'a pu etre envoye");
  }

  return sentTo;
}

function buildEmailHtml(
  dateFormatted: string,
  inspecteurNom?: string,
  entreprise?: EntrepriseInfo | null
): string {
  let signature = "";

  if (entreprise) {
    const lines: string[] = [];
    lines.push(`<strong>${entreprise.nom}</strong>`);
    if (inspecteurNom) lines.push(inspecteurNom);
    if (entreprise.adresse) {
      const adresseLine = [entreprise.adresse, entreprise.npa, entreprise.ville]
        .filter(Boolean)
        .join(" ");
      lines.push(adresseLine);
    }
    if (entreprise.telephone) lines.push(entreprise.telephone);
    if (entreprise.email) lines.push(entreprise.email);

    signature = `
      <hr style="border:none;border-top:1px solid #999;margin:20px 0"/>
      <p style="margin:0">${lines.join("<br/>")}</p>`;
  } else if (inspecteurNom) {
    signature = `
      <hr style="border:none;border-top:1px solid #999;margin:20px 0"/>
      <p style="margin:0">${inspecteurNom}</p>`;
  }

  return `
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint le rapport de visite du ${dateFormatted}.</p>
    <p>Excellente journée<br/>Portez-vous bien<br/>Bien à vous</p>
    ${signature}
  `;
}
