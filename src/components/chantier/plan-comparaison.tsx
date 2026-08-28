"use client";

import { useState } from "react";

export function PlanComparaison() {
  const [info, setInfo] = useState(false);

  return (
    <div className="text-center py-10 px-4">
      <div className="w-14 h-14 rounded-full bg-[#002855]/10 flex items-center justify-center mx-auto mb-3">
        <span className="material-symbols-outlined text-[#002855] text-2xl">
          compare_arrows
        </span>
      </div>
      <h3 className="text-lg font-semibold text-[#002855]">Bientôt disponible</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        La comparaison entre le plan d&apos;enquête publique (
        <span className="font-semibold text-[#2E7D32]">PE</span>) et le plan
        d&apos;exécution (<span className="font-semibold text-[#E67E22]">EXE</span>)
        sera disponible ici.
      </p>

      <button
        type="button"
        onClick={() => setInfo(true)}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 mt-4 bg-[#002855] text-white font-medium rounded-lg hover:bg-[#002855]/90 transition-colors text-sm"
      >
        <span className="material-symbols-outlined text-lg">rule</span>
        Sélectionner les plans à comparer
      </button>

      {info && (
        <p className="text-xs text-gray-500 mt-3">
          Fonctionnalité en cours de développement. En attendant, marquez vos
          documents comme plan PE ou EXE depuis l&apos;onglet Documents.
        </p>
      )}
    </div>
  );
}
