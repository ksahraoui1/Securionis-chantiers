import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getResendApiKey, getResendFromEmail } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml, isAllowedSupabaseUrl } from "@/lib/utils/security";

/**
 * POST /api/documents/email
 * Body: { documentId: string, to: string, subject?: string }
 *
 * Envoie un document de la base documentaire par email (pièce jointe).
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Rate limit: 20 emails par heure
  if (!checkRateLimit(`doc-email:${user.id}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
  }

  const { documentId, to, subject } = await request.json();

  if (!documentId || !to?.trim()) {
    return NextResponse.json({ error: "documentId et to sont requis" }, { status: 400 });
  }

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
  }

  // Load document
  const { data: doc, error: docError } = await supabase
    .from("base_documentaire")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  try {
    // SSRF protection: whitelist stricte du hostname Supabase
    if (!isAllowedSupabaseUrl(doc.fichier_url)) {
      return NextResponse.json({ error: "URL non autorisée" }, { status: 400 });
    }

    // Download file
    const fileRes = await fetch(doc.fichier_url, { signal: AbortSignal.timeout(30000) });
    if (!fileRes.ok) throw new Error("Impossible de télécharger le fichier");

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    // Load sender profile + enterprise info
    const { data: profile } = await supabase
      .from("profiles")
      .select("nom, entreprise_id")
      .eq("id", user.id)
      .single();

    let entrepriseNom = "";
    if (profile?.entreprise_id) {
      const { data: ent } = await supabase
        .from("entreprises")
        .select("nom")
        .eq("id", profile.entreprise_id)
        .single();
      if (ent) entrepriseNom = ent.nom;
    }

    const senderName = profile?.nom ?? "Securionis Chantiers";

    const resend = new Resend(getResendApiKey());

    await resend.emails.send({
      from: `${senderName} <${getResendFromEmail()}>`,
      to: [to.trim()],
      subject: subject?.trim() || `Document : ${doc.titre}`,
      html: `
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint le document : <strong>${escapeHtml(doc.titre)}</strong></p>
        ${doc.description ? `<p>${escapeHtml(doc.description)}</p>` : ""}
        ${doc.reference ? `<p><em>Référence : ${escapeHtml(doc.reference)}</em></p>` : ""}
        <br>
        <p>Cordialement,<br>${escapeHtml(senderName)}${entrepriseNom ? `<br>${escapeHtml(entrepriseNom)}` : ""}</p>
      `,
      attachments: [
        {
          filename: doc.fichier_nom,
          content: fileBuffer,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Document email error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email" },
      { status: 500 }
    );
  }
}
