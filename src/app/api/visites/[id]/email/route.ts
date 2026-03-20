import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendRapport } from "@/lib/email/send-rapport";

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

    const sentTo = await sendRapport(
      visite.rapport_url,
      destinataires,
      chantier?.adresse ?? "Chantier",
      visite.date_visite
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
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de l'envoi de l'email",
      },
      { status: 500 }
    );
  }
}
