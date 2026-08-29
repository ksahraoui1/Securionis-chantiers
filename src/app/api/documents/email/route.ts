import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getResendApiKey, getResendFromEmail } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml, isAllowedSupabaseUrl } from "@/lib/utils/security";
import { signerUrl } from "@/lib/utils/url-signee";

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
  if (!(await checkRateLimit(`doc-email:${user.id}`, 20, 60 * 60 * 1000))) {
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

  // Protection email header injection
  if (subject && /[\r\n]/.test(subject)) {
    return NextResponse.json({ error: "Sujet invalide" }, { status: 400 });
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

    // Download file avec limite de taille (50 Mo)
    // Le bucket est privé (SEC-03) : l'URL stockée n'est plus résolvable telle
    // quelle, il faut la signer. La whitelist ci-dessus reste satisfaite,
    // l'URL signée porte le même hôte.
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const urlSignee = await signerUrl(supabase, doc.fichier_url);
    if (!urlSignee) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }
    const fileRes = await fetch(urlSignee, { signal: AbortSignal.timeout(30000) });
    if (!fileRes.ok) throw new Error("Impossible de télécharger le fichier");

    const fileContentLength = parseInt(fileRes.headers.get("content-length") ?? "0", 10);
    if (fileContentLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 400 });
    }

    const fileArrayBuffer = await fileRes.arrayBuffer();
    if (fileArrayBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 400 });
    }
    const fileBuffer = Buffer.from(fileArrayBuffer);

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

    const rawName = profile?.nom ?? "Securionis Chantiers";
    // Nettoyer le nom d'expéditeur (pas de caractères spéciaux email)
    const senderName = rawName.replace(/[<>"'\r\n]/g, "").trim() || "Securionis Chantiers";

    const resend = new Resend(getResendApiKey());

    const result = await resend.emails.send({
      from: `${senderName} <${getResendFromEmail()}>`,
      to: [to.trim()],
      subject: subject?.trim() || `Document : ${doc.titre}`,
      html: `
        <p><strong>Ne veuille pas répondre à cette email ! Utilisez : ks.aigle@gmail.com</strong></p>
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

    if (result.error) {
      console.error("Resend error:", result.error);
      return NextResponse.json(
        { error: `Resend a refusé l'envoi : ${result.error.message}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error("Document email error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'envoi de l'email" },
      { status: 500 }
    );
  }
}
