import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendRapport(
  rapportUrl: string,
  destinataires: { nom: string; email: string }[],
  chantierAdresse: string,
  dateVisite: string
): Promise<string[]> {
  // Download PDF from Storage URL
  const pdfResponse = await fetch(rapportUrl);
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
          process.env.RESEND_FROM_EMAIL ?? "rapports@securionis.ch",
        to: dest.email,
        subject,
        html: `
          <p>Bonjour ${dest.nom},</p>
          <p>Veuillez trouver ci-joint le rapport de la visite de controle effectuee le ${dateFormatted} sur le chantier situe a l'adresse suivante :</p>
          <p><strong>${chantierAdresse}</strong></p>
          <p>Merci de prendre connaissance des eventuels ecarts constates et de proceder aux corrections dans les delais impartis.</p>
          <p>Cordialement,<br/>Securionis SA</p>
        `,
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
