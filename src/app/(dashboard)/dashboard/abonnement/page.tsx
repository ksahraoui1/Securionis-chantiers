"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SubInfo = {
  status: string;
  plan: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at: string | null;
} | null;

export default function AbonnementPage() {
  const [role, setRole] = useState<string>("");
  const [sub, setSub] = useState<SubInfo>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const searchParams = useSearchParams();

  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setRole(profile?.role ?? "invité");

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status, plan, current_period_end, trial_end, cancel_at")
        .eq("user_id", user.id)
        .single();
      setSub(subscription);
      setLoading(false);
    }
    load();
  }, []);

  async function handleCheckout(plan: "monthly" | "yearly") {
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-gray-500">
        Chargement...
      </div>
    );
  }

  const isActive = sub?.status === "active" || sub?.status === "trialing";
  const isTrial = sub?.status === "trialing";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Abonnement</h1>

      {success && (
        <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700">
          <span className="material-symbols-outlined text-lg align-middle mr-1">check_circle</span>
          Votre abonnement a été activé avec succès !
        </div>
      )}

      {canceled && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
          Le paiement a été annulé. Vous pouvez réessayer à tout moment.
        </div>
      )}

      {/* Statut actuel */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Votre plan actuel</p>
            <p className="text-xl font-bold mt-1">
              {role === "invité" && "Gratuit"}
              {role === "inspecteur" && (isActive ? `Inspecteur (${sub?.plan === "yearly" ? "annuel" : "mensuel"})` : "Inspecteur")}
              {role === "administrateur" && "Administrateur"}
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              isActive
                ? "bg-green-100 text-green-700"
                : role === "administrateur"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {isActive ? (isTrial ? "Essai gratuit" : "Actif") : role === "administrateur" ? "Admin" : "Gratuit"}
          </span>
        </div>

        {isTrial && sub?.trial_end && (
          <p className="text-sm text-amber-600 mt-3">
            <span className="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
            Essai gratuit jusqu'au {new Date(sub.trial_end).toLocaleDateString("fr-CH")}
          </p>
        )}

        {isActive && sub?.cancel_at && (
          <p className="text-sm text-red-600 mt-3">
            <span className="material-symbols-outlined text-sm align-middle mr-1">warning</span>
            Annulation prévue le {new Date(sub.cancel_at).toLocaleDateString("fr-CH")}
          </p>
        )}

        {isActive && (
          <button
            type="button"
            onClick={handlePortal}
            disabled={portalLoading}
            className="mt-4 px-4 py-2 min-h-[44px] text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {portalLoading ? "Chargement..." : "Gérer mon abonnement"}
          </button>
        )}
      </div>

      {/* Plans — affiché pour les invités */}
      {role === "invité" && (
        <>
          {/* Limites actuelles */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-amber-800 mb-2">Limites du plan gratuit :</p>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>- Maximum 2 chantiers</li>
              <li>- 1 visite par chantier</li>
              <li>- 1 photo par visite</li>
              <li>- Pas de génération de rapport PDF</li>
              <li>- Pas d'envoi par email</li>
            </ul>
          </div>

          {/* Cartes de prix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mensuel */}
            <div className="bg-white rounded-lg border-2 border-gray-200 p-6 flex flex-col">
              <h3 className="font-semibold text-lg">Mensuel</h3>
              <p className="text-3xl font-bold mt-2">
                29 <span className="text-base font-normal text-gray-500">CHF/mois</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">14 jours d'essai gratuit</p>
              <ul className="text-sm text-gray-700 mt-4 space-y-2 flex-1">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  Chantiers illimités
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  Visites illimitées
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  10 photos par visite
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  Rapports PDF + email
                </li>
              </ul>
              <button
                type="button"
                onClick={() => handleCheckout("monthly")}
                disabled={checkoutLoading !== null}
                className="mt-6 w-full py-3 min-h-[44px] bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {checkoutLoading === "monthly" ? "Redirection..." : "Commencer l'essai gratuit"}
              </button>
            </div>

            {/* Annuel */}
            <div className="bg-white rounded-lg border-2 border-blue-600 p-6 flex flex-col relative">
              <span className="absolute -top-3 left-4 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                -25%
              </span>
              <h3 className="font-semibold text-lg">Annuel</h3>
              <p className="text-3xl font-bold mt-2">
                260 <span className="text-base font-normal text-gray-500">CHF/an</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Soit ~21.70 CHF/mois — 14 jours d'essai gratuit
              </p>
              <ul className="text-sm text-gray-700 mt-4 space-y-2 flex-1">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  Chantiers illimités
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  Visites illimitées
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  10 photos par visite
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                  Rapports PDF + email
                </li>
              </ul>
              <button
                type="button"
                onClick={() => handleCheckout("yearly")}
                disabled={checkoutLoading !== null}
                className="mt-6 w-full py-3 min-h-[44px] bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {checkoutLoading === "yearly" ? "Redirection..." : "Commencer l'essai gratuit"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
