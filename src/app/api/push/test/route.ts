import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
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

  // Notification de test : 10 par heure
  if (!checkRateLimit(`push-test:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429 }
    );
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
