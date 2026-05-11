import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Init Web Push avec les clés VAPID au premier appel.
 * Générer les clés avec : npx web-push generate-vapid-keys
 */
let initialized = false;
function ensureInit() {
  if (initialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:rapports@securionis.com";

  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non définies. Voir .env.example.",
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Envoie une notification push à un utilisateur (toutes ses subscriptions).
 * Les subscriptions expirées (410 Gone) sont supprimées automatiquement.
 * Retourne le nombre de notifications délivrées.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload,
): Promise<number> {
  ensureInit();
  const supabase = await createServiceClient();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  const expiredIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        delivered++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        } else {
          console.error("Push send error:", err);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return delivered;
}
