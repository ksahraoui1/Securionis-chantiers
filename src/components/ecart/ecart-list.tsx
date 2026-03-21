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
      <p className="text-sm text-gray-500 py-4">
        Aucune non-conformité enregistrée pour ce chantier.
      </p>
    );
  }

  if (ouverts.length === 0 && corriges.length > 0) {
    return (
      <div>
        <p className="text-sm text-green-600 py-4 font-medium">
          Toutes les non-conformités ont été corrigées.
        </p>
        <button
          type="button"
          onClick={() => setShowCorriges(!showCorriges)}
          className="text-sm text-blue-600 hover:underline"
        >
          {showCorriges
            ? "Masquer l'historique"
            : `Voir l'historique (${corriges.length})`}
        </button>
        {showCorriges && (
          <div className="mt-3 space-y-3 opacity-60">
            {corriges.map((ecart) => (
              <div
                key={ecart.id}
                className="bg-white rounded-lg border border-gray-400 p-4"
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
          className="bg-white rounded-lg border border-gray-400 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {ecart.description}
              </p>
              {ecart.delai && (
                <p className="text-xs text-gray-500 mt-1">
                  Délai : {ecart.delai}
                </p>
              )}
            </div>
            <EcartStatusBadge statut={ecart.statut} />
          </div>
          {onUpdateStatut && (
            <button
              type="button"
              onClick={() => handleCorrige(ecart)}
              disabled={updating === ecart.id}
              className="mt-3 px-4 py-2 min-h-touch text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 font-medium"
            >
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
            className="text-sm text-blue-600 hover:underline"
          >
            {showCorriges
              ? "Masquer les corrigées"
              : `Voir les corrigées (${corriges.length})`}
          </button>
          {showCorriges && (
            <div className="mt-3 space-y-3 opacity-60">
              {corriges.map((ecart) => (
                <div
                  key={ecart.id}
                  className="bg-white rounded-lg border border-gray-400 p-4"
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
