import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/utils/security";

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
  if (!checkRateLimit(`create-user:${user.id}`, 10, 60 * 60 * 1000)) {
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
    });

  if (createError) {
    console.error("Create user error:", createError.message);
    return NextResponse.json(
      { error: "Impossible de créer l'utilisateur" },
      { status: 400 }
    );
  }

  if (newUser.user) {
    await serviceClient.from("profiles").upsert({
      id: newUser.user.id,
      nom,
      email,
      role,
      entreprise_id: profile.entreprise_id,
    });

    // Audit log
    await serviceClient.from("audit_logs").insert({
      user_id: user.id,
      action: "create_user",
      resource: "profiles",
      resource_id: newUser.user.id,
      details: { nom, email, role },
    });
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id });
}
