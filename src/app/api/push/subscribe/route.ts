import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 * Upsert la subscription pour l'utilisateur connecté.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 });
  }

  const parsed = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (
    !parsed.endpoint ||
    !parsed.keys?.p256dh ||
    !parsed.keys?.auth ||
    typeof parsed.endpoint !== "string" ||
    !parsed.endpoint.startsWith("https://")
  ) {
    return NextResponse.json(
      { error: "Subscription invalide" },
      { status: 400 },
    );
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: parsed.endpoint,
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'abonnement" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/push/subscribe?endpoint=...
 * Supprime la subscription correspondante de l'utilisateur connecté.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint requis" }, { status: 400 });
  }

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ success: true });
}
