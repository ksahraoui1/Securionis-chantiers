import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_ROLES = ["inspecteur", "administrateur"];

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

  // Rate limit: 10 créations par heure
  if (!checkRateLimit(`create-user:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes. Réessayez plus tard." }, { status: 429 });
  }

  const { nom, email, password, role } = await request.json();

  // Validation du rôle
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  if (!nom || !email || !password || !role) {
    return NextResponse.json(
      { error: "Tous les champs sont obligatoires" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  const { data: newUser, error: createError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError) {
    return NextResponse.json(
      { error: createError.message },
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
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id });
}
