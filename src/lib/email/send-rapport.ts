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
          process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: dest.email,
        subject,
        html: `
          <p>Bonjour,</p>
          <p>Veuillez trouver ci-joint le rapport de visite du ${dateFormatted}</p>
          <p>Excellente journée<br/>Portez-vous bien<br/>Bien à vous</p>
          <hr style="border:none;border-top:1px solid #999;margin:20px 0"/>
          <p style="margin:0"><strong>FWN</strong><br/>
          Karim Sahraoui<br/>
          Rue du Pied-de-Ville 15<br/>
          1896 Vouvry</p>
          <p style="margin:8px 0 0 0">Mobile 079 596 80 57<br/>
          ks.aigle@gmail.com</p>
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
