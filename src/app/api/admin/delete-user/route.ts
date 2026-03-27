import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function DELETE(request: Request) {
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

  const { userId } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }

  // Empêcher la suppression de soi-même
  if (userId === user.id) {
    return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // Vérifier que l'utilisateur cible appartient à la même entreprise
  const { data: targetProfile } = await serviceClient
    .from("profiles")
    .select("entreprise_id, nom, email")
    .eq("id", userId)
    .single();

  if (!targetProfile || targetProfile.entreprise_id !== profile.entreprise_id) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  // Supprimer le profil (cascade supprimera les données liées)
  await serviceClient.from("profiles").delete().eq("id", userId);

  // Supprimer de auth.users
  const { error: authError } = await serviceClient.auth.admin.deleteUser(userId);

  if (authError) {
    console.error("Delete user auth error:", authError.message);
    return NextResponse.json({ error: "Impossible de supprimer l'utilisateur" }, { status: 500 });
  }

  // Audit log
  await serviceClient.from("audit_logs").insert({
    user_id: user.id,
    action: "delete_user",
    resource: "profiles",
    resource_id: userId,
    details: { nom: targetProfile.nom, email: targetProfile.email },
  });

  return NextResponse.json({ success: true });
}
