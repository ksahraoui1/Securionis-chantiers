import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { journaliser } from "@/lib/audit";

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

  // Rate limit: 10 suppressions par heure
  if (!checkRateLimit(`admin-delete-user:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
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

  // Cloisonnement multi-entreprise. La comparaison seule était contournable :
  // `null !== null` vaut false, donc un administrateur sans entreprise pouvait
  // agir sur tout profil sans entreprise, quelle que soit son organisation.
  if (!profile.entreprise_id) {
    return NextResponse.json(
      { error: "Votre compte n'est rattaché à aucune entreprise" },
      { status: 403 }
    );
  }

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
  await journaliser({
    userId: user.id,
    action: "delete_user",
    resource: "profiles",
    resourceId: userId,
    details: { nom: targetProfile.nom, email: targetProfile.email },
  });

  return NextResponse.json({ success: true });
}
