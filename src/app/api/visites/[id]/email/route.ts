import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendRapport } from "@/lib/email/send-rapport";
import { canAccessVisite } from "@/lib/utils/security";

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

    // Vérification d'autorisation
    if (!(await canAccessVisite(supabase, user.id, visiteId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
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

    // Load destinataires
    const { data: destinataires } = await supabase
      .from("destinataires")
      .select("*")
      .eq("chantier_id", visite.chantier_id);

    if (!destinataires || destinataires.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire configure pour ce chantier" },
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

    const sentTo = await sendRapport(
      visite.rapport_url,
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
