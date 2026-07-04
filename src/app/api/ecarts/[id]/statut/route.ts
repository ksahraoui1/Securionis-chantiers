import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STATUTS_ECART } from "@/lib/utils/constants";
import { canAccessChantier } from "@/lib/utils/security";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_TRANSITIONS: Record<string, string[]> = {
  [STATUTS_ECART.OUVERT]: [STATUTS_ECART.EN_COURS_CORRECTION, STATUTS_ECART.CORRIGE],
  [STATUTS_ECART.EN_COURS_CORRECTION]: [STATUTS_ECART.CORRIGE],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ecartId } = await params;

  try {
    const supabase = await createClient();

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    // Rate limit: 60 changements de statut par heure
    if (!checkRateLimit(`ecart-statut:${user.id}`, 60, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
    }

    // Load current ecart
    const { data: ecart } = await supabase
      .from("ecarts")
      .select("*, chantier_id")
      .eq("id", ecartId)
      .single();

    if (!ecart) {
      return NextResponse.json(
        { error: "Ecart introuvable" },
        { status: 404 }
      );
    }

    // Vérifier l'accès au chantier de l'écart
    if (!(await canAccessChantier(supabase, user.id, ecart.chantier_id))) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // Parse requested statut
    const body = await request.json();
    const newStatut = body.statut;

    if (!newStatut) {
      return NextResponse.json(
        { error: "Le statut est requis" },
        { status: 400 }
      );
    }

    // Validate transition: ouvert -> en_cours_correction|corrige, en_cours_correction -> corrige
    const allowed = VALID_TRANSITIONS[ecart.statut];

    if (!allowed) {
      return NextResponse.json(
        { error: "La non-conformité est déjà au statut final" },
        { status: 400 }
      );
    }

    if (!allowed.includes(newStatut)) {
      return NextResponse.json(
        {
          error: `Transition invalide. Statuts autorisés : ${allowed.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Update ecart
    const { data: updated, error: updateError } = await supabase
      .from("ecarts")
      .update({
        statut: newStatut,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ecartId)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "update_ecart_statut",
      resource: "ecart",
      resource_id: ecartId,
      details: { old_statut: ecart.statut, new_statut: newStatut },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Ecart statut update error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut" },
      { status: 500 }
    );
  }
}
