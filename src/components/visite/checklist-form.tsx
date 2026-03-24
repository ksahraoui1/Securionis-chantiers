"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChecklistItem } from "./checklist-item";
import { useAutosave } from "@/hooks/use-autosave";
import type { Tables } from "@/types/database";

type PointWithDocs = Tables<"points_controle"> & {
  point_controle_documents?: Tables<"point_controle_documents">[];
};

interface ChecklistFormProps {
  visiteId: string;
  chantierId: string;
  categorieIds: string[];
  existingReponses: Record<
    string,
    { id: string; valeur: string; remarque: string | null; photos: string[] }
  >;
  onValidate: () => void;
  validating: boolean;
}

export function ChecklistForm({
  visiteId,
  chantierId,
  categorieIds,
  existingReponses,
  onValidate,
  validating,
}: ChecklistFormProps) {
  const [points, setPoints] = useState<PointWithDocs[]>([]);
  const [loading, setLoading] = useState(true);
  const { save, saveStatus } = useAutosave(visiteId);

  useEffect(() => {
    async function loadPoints() {
      const supabase = createClient();

      // Try to load theme_ids from localStorage (new visits)
      const storedThemes = localStorage.getItem(`visite-themes-${visiteId}`);
      const themeIds: string[] | null = storedThemes ? JSON.parse(storedThemes) : null;

      let query = supabase
        .from("points_controle")
        .select("*, point_controle_documents(*)")
        .eq("actif", true)
        .order("objet")
        .order("intitule");

      if (themeIds && themeIds.length > 0) {
        // New flow: filter by themes
        query = query.in("theme_id", themeIds);
      } else if (categorieIds.length > 0) {
        // Legacy flow: filter by categories
        query = query.in("categorie_id", categorieIds);
      }

      const { data } = await query;
      if (data) setPoints(data as PointWithDocs[]);
      setLoading(false);
    }
    if (categorieIds.length > 0) loadPoints();
  }, [categorieIds, visiteId]);

  const handleChange = useCallback(
    (data: {
      point_controle_id: string;
      valeur: string;
      remarque: string | null;
      photos: string[];
    }) => {
      save({
        visite_id: visiteId,
        point_controle_id: data.point_controle_id,
        valeur: data.valeur,
        remarque: data.remarque,
        photos: data.photos,
      });
    },
    [save, visiteId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">
          Chargement des points de contrôle...
        </div>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        Aucun point de contrôle pour les thèmes sélectionnés.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-gray-50 py-2 z-10">
        <span className="text-sm text-gray-500">
          {points.length} point{points.length > 1 ? "s" : ""} de contrôle
        </span>
        <span className="text-xs text-gray-400">
          {saveStatus === "saving" && "Enregistrement..."}
          {saveStatus === "saved" && "Enregistré"}
          {saveStatus === "saved-offline" && "Sauvegardé hors-ligne"}
          {saveStatus === "error" && "Erreur de sauvegarde"}
        </span>
      </div>

      {points.map((point) => {
        const existing = existingReponses[point.id];
        return (
          <ChecklistItem
            key={point.id}
            pointControle={point}
            chantierId={chantierId}
            visiteId={visiteId}
            reponseId={existing?.id ?? point.id}
            initialValeur={existing?.valeur}
            initialRemarque={existing?.remarque}
            initialPhotos={existing?.photos ?? []}
            onChange={handleChange}
            documents={point.point_controle_documents ?? []}
          />
        );
      })}

      <div className="sticky bottom-0 bg-gray-50 pt-4 pb-6 border-t">
        <button
          type="button"
          onClick={onValidate}
          disabled={validating}
          className="w-full py-4 min-h-touch bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 text-lg"
        >
          {validating ? "Validation en cours..." : "Valider la visite"}
        </button>
      </div>
    </div>
  );
}
