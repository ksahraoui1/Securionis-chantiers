"use client";

import { useState } from "react";
import { EcartStatusBadge } from "./ecart-status-badge";
import { STATUTS_ECART } from "@/lib/utils/constants";
import type { Tables } from "@/types/database";

interface EcartListProps {
  ecarts: Tables<"ecarts">[];
  onUpdateStatut?: (id: string, statut: string) => Promise<void>;
}

const NEXT_STATUT: Record<string, string | null> = {
  [STATUTS_ECART.OUVERT]: STATUTS_ECART.EN_COURS_CORRECTION,
  [STATUTS_ECART.EN_COURS_CORRECTION]: STATUTS_ECART.CORRIGE,
  [STATUTS_ECART.CORRIGE]: null,
};

const NEXT_LABEL: Record<string, string> = {
  [STATUTS_ECART.OUVERT]: "Marquer en cours",
  [STATUTS_ECART.EN_COURS_CORRECTION]: "Marquer corrigé",
};

export function EcartList({ ecarts, onUpdateStatut }: EcartListProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  async function handleUpdate(ecart: Tables<"ecarts">) {
    const next = NEXT_STATUT[ecart.statut];
    if (!next || !onUpdateStatut) return;

    setUpdating(ecart.id);
    await onUpdateStatut(ecart.id, next);
    setUpdating(null);
  }

  if (ecarts.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">
        Aucun écart enregistré pour ce chantier.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {ecarts.map((ecart) => (
        <div
          key={ecart.id}
          className="bg-white rounded-lg border border-gray-200 p-4"
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
          {onUpdateStatut && NEXT_STATUT[ecart.statut] && (
            <button
              type="button"
              onClick={() => handleUpdate(ecart)}
              disabled={updating === ecart.id}
              className="mt-3 px-3 py-2 min-h-touch text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              {updating === ecart.id
                ? "Mise à jour..."
                : NEXT_LABEL[ecart.statut]}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
