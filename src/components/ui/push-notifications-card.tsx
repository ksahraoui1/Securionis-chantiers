"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationsCard() {
  const { status, error, busy, subscribe, unsubscribe, sendTest } =
    usePushNotifications();
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  async function handleTest() {
    setTestFeedback(null);
    const delivered = await sendTest();
    if (delivered > 0) {
      setTestFeedback(
        `Notification envoyée à ${delivered} appareil${delivered > 1 ? "s" : ""}. Vérifiez votre navigateur.`,
      );
    } else if (!error) {
      setTestFeedback("Aucun appareil n'a reçu la notification.");
    }
  }

  if (status === "loading") {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-sm mb-1">Notifications push</h3>
        <p className="text-xs text-gray-500">
          Votre navigateur ne supporte pas les notifications push.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Notifications push</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Recevez des alertes sur cet appareil même quand l&apos;application est
          fermée.
        </p>
      </div>

      {status === "denied" && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Vous avez bloqué les notifications pour ce site. Modifiez les
          permissions dans les paramètres de votre navigateur pour les
          réactiver.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
      {testFeedback && (
        <div className="rounded-lg bg-green-50 p-3 text-xs text-green-700">
          {testFeedback}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {status === "unsubscribed" && (
          <button
            type="button"
            onClick={subscribe}
            disabled={busy}
            className="px-4 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Activation…" : "Activer les notifications"}
          </button>
        )}
        {status === "subscribed" && (
          <>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              className="px-4 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Envoi…" : "Envoyer un test"}
            </button>
            <button
              type="button"
              onClick={unsubscribe}
              disabled={busy}
              className="px-4 py-2 min-h-[44px] bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Désactiver
            </button>
          </>
        )}
      </div>
    </div>
  );
}
