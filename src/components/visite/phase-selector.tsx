"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

interface PhaseSelectorProps {
  onSelect: (phase: Tables<"phases">) => void;
  selected?: string | null;
}

export function PhaseSelector({ onSelect, selected }: PhaseSelectorProps) {
  const [phases, setPhases] = useState<Tables<"phases">[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("phases")
        .select("*")
        .order("numero");
      if (data) setPhases(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Chargement des phases...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        Sélectionnez la phase de construction
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {phases.map((phase) => (
          <button
            key={phase.id}
            onClick={() => onSelect(phase)}
            className={`p-4 rounded-lg border-2 text-left transition-colors min-h-touch ${
              selected === phase.id
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200 bg-white hover:border-blue-300"
            }`}
          >
            <span className="text-sm text-gray-500">
              Phase {phase.numero}
            </span>
            <p className="font-medium mt-1">{phase.libelle}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
