import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

/**
 * POST /api/push/test
 * Envoie une notification de test à toutes les subscriptions de l'utilisateur.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const delivered = await sendPushToUser(user.id, {
      title: "Securionis — Notification de test",
      body: "Si vous lisez ceci, les notifications push sont opérationnelles.",
      url: "/dashboard",
      tag: "test",
    });
    return NextResponse.json({ delivered });
  } catch (err) {
    console.error("Push test error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de l'envoi de la notification",
      },
      { status: 500 },
    );
  }
}
