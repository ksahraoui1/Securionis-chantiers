"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

type PointWithDocs = Tables<"points_controle"> & {
  point_controle_documents?: Tables<"point_controle_documents">[];
};

interface QuickAddPointProps {
  themeIds: string[];
  categorieIds: string[];
  onPointCreated: (point: PointWithDocs) => void;
}

export function QuickAddPoint({ themeIds, categorieIds, onPointCreated }: QuickAddPointProps) {
  const [open, setOpen] = useState(false);
  const [intitule, setIntitule] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!intitule.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      const payload: Record<string, unknown> = {
        intitule: intitule.trim(),
        is_custom: true,
        actif: true,
        phase_id: null,
        categorie_id: null,
        theme_id: null,
      };

      // Associer au premier thème disponible, sinon première catégorie
      if (themeIds.length > 0) {
        payload.theme_id = themeIds[0];
        // Récupérer la categorie_id du thème
        const { data: theme } = await supabase
          .from("themes")
          .select("categorie_id")
          .eq("id", themeIds[0])
          .single();
        if (theme) payload.categorie_id = theme.categorie_id;
      } else if (categorieIds.length > 0) {
        payload.categorie_id = categorieIds[0];
      }

      const { data: newPoint, error: insertError } = await supabase
        .from("points_controle")
        .insert(payload)
        .select("*, point_controle_documents(*)")
        .single();

      if (insertError) throw new Error(insertError.message);
      if (newPoint) {
        onPointCreated(newPoint as PointWithDocs);
        setIntitule("");
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 min-h-touch border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-lg">add_circle</span>
        Ajouter un point de contrôle personnalisé
      </button>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-blue-800">Nouveau point de contrôle</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
      <textarea
        value={intitule}
        onChange={(e) => setIntitule(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ex : Vérifier la fixation des garde-corps provisoires..."
        rows={2}
        autoFocus
        className="w-full rounded-lg border border-blue-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="px-3 py-2 min-h-touch text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!intitule.trim() || saving}
          className="px-4 py-2 min-h-touch text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Création..." : "Ajouter"}
        </button>
      </div>
    </div>
  );
}
