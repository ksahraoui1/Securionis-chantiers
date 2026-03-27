import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const VALID_ROLES = ["invité", "inspecteur", "administrateur"];

export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, entreprise_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "administrateur") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const { userId, nom, email, role } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }

  // Vérifier que l'utilisateur cible appartient à la même entreprise
  const serviceClient = await createServiceClient();

  const { data: targetProfile } = await serviceClient
    .from("profiles")
    .select("entreprise_id")
    .eq("id", userId)
    .single();

  if (!targetProfile || targetProfile.entreprise_id !== profile.entreprise_id) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  // Construire l'objet de mise à jour
  const updates: Record<string, string> = {};
  if (nom?.trim()) updates.nom = nom.trim();
  if (role && VALID_ROLES.includes(role)) updates.role = role;
  updates.updated_at = new Date().toISOString();

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Aucune modification" }, { status: 400 });
  }

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (updateError) {
    console.error("Update user error:", updateError.message);
    return NextResponse.json({ error: "Impossible de modifier l'utilisateur" }, { status: 500 });
  }

  // Si l'email change, mettre à jour dans auth.users aussi
  if (email?.trim()) {
    const { error: authError } = await serviceClient.auth.admin.updateUserById(
      userId,
      { email: email.trim() }
    );

    if (!authError) {
      await serviceClient
        .from("profiles")
        .update({ email: email.trim() })
        .eq("id", userId);
    }
  }

  // Audit log
  await serviceClient.from("audit_logs").insert({
    user_id: user.id,
    action: "update_user",
    resource: "profiles",
    resource_id: userId,
    details: updates,
  });

  return NextResponse.json({ success: true });
}
