import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/utils/security";
import { journaliser } from "@/lib/audit";

const VALID_ROLES = ["invité", "inspecteur", "administrateur"];

export async function POST(request: Request) {
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

  if (!profile.entreprise_id) {
    return NextResponse.json(
      { error: "Votre profil n'est pas associé à une entreprise" },
      { status: 400 }
    );
  }

  // Rate limit: 10 créations par heure
  if (!(await checkRateLimit(`create-user:${user.id}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
  }

  const { nom, email, password, role } = await request.json();

  if (!nom || !email || !password || !role) {
    return NextResponse.json(
      { error: "Tous les champs sont obligatoires" },
      { status: 400 }
    );
  }

  // Validation du rôle
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  // Validation email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
  }

  // Validation mot de passe
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  const { data: newUser, error: createError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Marqueur exigé par `handle_new_user` depuis la migration 053 : c'est
      // lui qui distingue une création par un administrateur d'une inscription
      // publique, et qui referme cette dernière **au niveau de la base**.
      //
      // ⚠️ `app_metadata` et non `user_metadata` : le premier n'est modifiable
      // que par le `service_role`, le second l'est par le titulaire du compte.
      // Fondé sur `user_metadata`, le contrôle serait contournable en une
      // requête depuis le navigateur.
      app_metadata: { cree_par: "admin" },
    });

  if (createError) {
    console.error("Create user error:", createError.message);
    return NextResponse.json(
      { error: "Impossible de créer l'utilisateur" },
      { status: 400 }
    );
  }

  if (newUser.user) {
    // Le trigger handle_new_user a déjà inséré le profil avec le rôle
    // « invité » : cet upsert applique le rôle réellement demandé. Son échec
    // laisserait un compte au mauvais rôle, il ne doit pas passer inaperçu.
    const { error: profileError } = await serviceClient.from("profiles").upsert({
      id: newUser.user.id,
      nom,
      email,
      role,
      entreprise_id: profile.entreprise_id,
    });

    if (profileError) {
      console.error("Create user — échec de l'upsert du profil:", profileError.message);
      // Le compte Auth existe mais son rôle n'est pas celui demandé : on le
      // supprime plutôt que de laisser un compte incohérent en place.
      await serviceClient.auth.admin.deleteUser(newUser.user.id);
      return NextResponse.json(
        { error: "Impossible d'appliquer le rôle au compte créé" },
        { status: 500 }
      );
    }

    // Audit log. Le compte est valide : un échec de journalisation ne l'annule
    // pas, mais `journaliser()` le rend visible dans les logs serveur.
    await journaliser({
      userId: user.id,
      action: "create_user",
      resource: "profiles",
      resourceId: newUser.user.id,
      details: { nom, email, role },
    });
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id });
}
