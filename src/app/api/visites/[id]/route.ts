import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessVisite } from "@/lib/utils/security";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: visiteId } = await params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Vérifier l'autorisation
    if (!(await canAccessVisite(supabase, user.id, visiteId))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Charger la visite pour vérifier le statut
    const { data: visite } = await supabase
      .from("visites")
      .select("id, statut, chantier_id")
      .eq("id", visiteId)
      .single();

    if (!visite) {
      return NextResponse.json({ error: "Visite introuvable" }, { status: 404 });
    }

    // Interdire la suppression d'une visite terminée
    if (visite.statut === "terminee") {
      return NextResponse.json(
        { error: "Impossible de supprimer une visite terminée" },
        { status: 400 }
      );
    }

    // Supprimer les réponses (et photos associées via DB)
    const { error: reponsesError } = await supabase
      .from("reponses")
      .delete()
      .eq("visite_id", visiteId);

    if (reponsesError) {
      throw new Error(reponsesError.message);
    }

    // Supprimer la visite
    const { error: deleteError } = await supabase
      .from("visites")
      .delete()
      .eq("id", visiteId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "delete_visite",
      resource: "visite",
      resource_id: visiteId,
      details: { chantier_id: visite.chantier_id, statut: visite.statut },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Visite delete error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la visite" },
      { status: 500 }
    );
  }
}
