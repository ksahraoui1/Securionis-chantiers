"use client";

import { useState } from "react";
import { EcartStatusBadge } from "./ecart-status-badge";
import { STATUTS_ECART } from "@/lib/utils/constants";
import type { Tables } from "@/types/database";

interface EcartListProps {
  ecarts: Tables<"ecarts">[];
  onUpdateStatut?: (id: string, statut: string) => Promise<void>;
}

export function EcartList({ ecarts, onUpdateStatut }: EcartListProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [showCorriges, setShowCorriges] = useState(false);
  const [localEcarts, setLocalEcarts] = useState(ecarts);

  const ouverts = localEcarts.filter(
    (e) => e.statut !== STATUTS_ECART.CORRIGE
  );
  const corriges = localEcarts.filter(
    (e) => e.statut === STATUTS_ECART.CORRIGE
  );

  async function handleCorrige(ecart: Tables<"ecarts">) {
    if (!onUpdateStatut) return;
    setUpdating(ecart.id);
    await onUpdateStatut(ecart.id, STATUTS_ECART.CORRIGE);
    setLocalEcarts((prev) =>
      prev.map((e) =>
        e.id === ecart.id ? { ...e, statut: STATUTS_ECART.CORRIGE } : e
      )
    );
    setUpdating(null);
  }

  if (localEcarts.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-2xl text-stone-400">check_circle</span>
        </div>
        <p className="text-sm text-gray-400">
          Aucune non-conformité enregistrée pour ce chantier.
        </p>
      </div>
    );
  }

  if (ouverts.length === 0 && corriges.length > 0) {
    return (
      <div>
        <div className="flex items-center gap-2 py-4">
          <span className="material-symbols-outlined text-emerald-500">task_alt</span>
          <p className="text-sm text-emerald-700 font-semibold">
            Toutes les non-conformités ont été corrigées.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCorriges(!showCorriges)}
          className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-base">
            {showCorriges ? "expand_less" : "expand_more"}
          </span>
          {showCorriges
            ? "Masquer l'historique"
            : `Voir l'historique (${corriges.length})`}
        </button>
        {showCorriges && (
          <div className="mt-3 space-y-3 opacity-60">
            {corriges.map((ecart) => (
              <div
                key={ecart.id}
                className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-subtle"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-900 line-through">
                    {ecart.description}
                  </p>
                  <EcartStatusBadge statut={ecart.statut} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ouverts.map((ecart) => (
        <div
          key={ecart.id}
          className="bg-white rounded-2xl border border-stone-200/80 p-4 sm:p-5 shadow-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {ecart.description}
              </p>
              {ecart.delai && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="material-symbols-outlined text-xs text-gray-400">schedule</span>
                  <p className="text-xs text-gray-400">
                    Délai : {ecart.delai}
                  </p>
                </div>
              )}
            </div>
            <EcartStatusBadge statut={ecart.statut} />
          </div>
          {onUpdateStatut && (
            <button
              type="button"
              onClick={() => handleCorrige(ecart)}
              disabled={updating === ecart.id}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 min-h-touch text-sm bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 disabled:opacity-50 font-medium transition-colors ring-1 ring-inset ring-emerald-600/10"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              {updating === ecart.id
                ? "Mise à jour..."
                : "Marquer conforme"}
            </button>
          )}
        </div>
      ))}

      {corriges.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowCorriges(!showCorriges)}
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-base">
              {showCorriges ? "expand_less" : "expand_more"}
            </span>
            {showCorriges
              ? "Masquer les corrigées"
              : `Voir les corrigées (${corriges.length})`}
          </button>
          {showCorriges && (
            <div className="mt-3 space-y-3 opacity-60">
              {corriges.map((ecart) => (
                <div
                  key={ecart.id}
                  className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-subtle"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-900 line-through">
                      {ecart.description}
                    </p>
                    <EcartStatusBadge statut={ecart.statut} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
