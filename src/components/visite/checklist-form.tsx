"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChecklistItem } from "./checklist-item";
import { ThemeAdder } from "./theme-adder";
import { QuickAddPoint } from "./quick-add-point";
import { PointSelector } from "./point-selector";
import { useAutosave } from "@/hooks/use-autosave";
import type { Tables } from "@/types/database";

type LinkedDoc = {
  base_documentaire: { id: string; titre: string; fichier_url: string; type_fichier: string } | null;
};

type PointWithDocs = Tables<"points_controle"> & {
  point_controle_documents?: Tables<"point_controle_documents">[];
  point_controle_doc_liens?: LinkedDoc[];
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
  const [allPoints, setAllPoints] = useState<PointWithDocs[]>([]);
  const [points, setPoints] = useState<PointWithDocs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showThemeAdder, setShowThemeAdder] = useState(false);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [selectionDone, setSelectionDone] = useState(false);
  const { save, saveStatus } = useAutosave(visiteId);

  // Load points based on current themeIds
  const loadPoints = useCallback(async (currentThemeIds: string[]) => {
    const supabase = createClient();

    let query = supabase
      .from("points_controle")
      .select("*, point_controle_documents(*), point_controle_doc_liens(base_documentaire(id, titre, fichier_url, type_fichier))")
      .eq("actif", true)
      .order("objet")
      .order("intitule");

    if (currentThemeIds.length > 0) {
      query = query.in("theme_id", currentThemeIds);
    } else if (categorieIds.length > 0) {
      query = query.in("categorie_id", categorieIds);
    }

    const { data } = await query;
    if (data) {
      const loaded = data as PointWithDocs[];
      setAllPoints(loaded);

      // Si des réponses existent déjà, on saute la sélection (visite reprise)
      const hasExistingReponses = Object.keys(existingReponses).length > 0;
      if (hasExistingReponses) {
        setPoints(loaded);
        setSelectionDone(true);
      } else {
        // Vérifier si une sélection précédente existe en localStorage
        const storedSelection = localStorage.getItem(`visite-selected-points-${visiteId}`);
        if (storedSelection) {
          try {
            const savedIds = new Set<string>(JSON.parse(storedSelection));
            const filtered = loaded.filter((p) => savedIds.has(p.id));
            if (filtered.length > 0) {
              setPoints(filtered);
              setSelectionDone(true);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
    setLoading(false);
  }, [categorieIds, existingReponses]);

  // Initial load
  useEffect(() => {
    const storedThemes = localStorage.getItem(`visite-themes-${visiteId}`);
    const initialThemeIds: string[] = storedThemes ? JSON.parse(storedThemes) : [];
    setThemeIds(initialThemeIds);

    if (initialThemeIds.length > 0 || categorieIds.length > 0) {
      loadPoints(initialThemeIds);
    }
  }, [categorieIds, visiteId, loadPoints]);

  // Handle adding new themes — append new points without losing existing ones
  async function handleThemesAdded(newThemeIds: string[]) {
    const onlyNew = newThemeIds.filter((id) => !themeIds.includes(id));
    if (onlyNew.length === 0) {
      setShowThemeAdder(false);
      return;
    }

    const merged = [...new Set([...themeIds, ...onlyNew])];
    setThemeIds(merged);
    localStorage.setItem(`visite-themes-${visiteId}`, JSON.stringify(merged));
    setShowThemeAdder(false);

    // Load only the new points
    const supabase = createClient();
    const { data } = await supabase
      .from("points_controle")
      .select("*, point_controle_documents(*), point_controle_doc_liens(base_documentaire(id, titre, fichier_url, type_fichier))")
      .eq("actif", true)
      .in("theme_id", onlyNew)
      .order("objet")
      .order("intitule");

    if (data) {
      const newPoints = data as PointWithDocs[];
      const existingIds = new Set(points.map((p) => p.id));
      const toAdd = newPoints.filter((p) => !existingIds.has(p.id));

      setAllPoints((prev) => [...prev, ...toAdd]);
      setPoints((prev) => {
        const updated = [...prev, ...toAdd];
        // Mettre à jour la sélection sauvegardée
        localStorage.setItem(
          `visite-selected-points-${visiteId}`,
          JSON.stringify(updated.map((p) => p.id))
        );
        return updated;
      });
    }
  }

  // Handle point selection confirmation
  function handleSelectionConfirm(selectedIds: string[]) {
    const selectedSet = new Set(selectedIds);
    setPoints(allPoints.filter((p) => selectedSet.has(p.id)));
    setSelectionDone(true);
    // Sauvegarder la sélection pour reprise
    localStorage.setItem(`visite-selected-points-${visiteId}`, JSON.stringify(selectedIds));
  }

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

  // Étape 1 : sélection des points à contrôler
  if (!selectionDone && allPoints.length > 0) {
    return (
      <PointSelector
        points={allPoints}
        onConfirm={handleSelectionConfirm}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-gray-50 py-2 z-10">
        <span className="text-sm text-gray-500">
          {points.length} point{points.length > 1 ? "s" : ""} de contrôle
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {saveStatus === "saving" && "Enregistrement..."}
            {saveStatus === "saved" && "Enregistré"}
            {saveStatus === "saved-offline" && "Sauvegardé hors-ligne"}
            {saveStatus === "error" && "Erreur de sauvegarde"}
          </span>
          <button
            type="button"
            onClick={() => setShowThemeAdder(true)}
            className="px-3 py-1.5 min-h-touch text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Catégories / Thèmes
          </button>
        </div>
      </div>

      {showThemeAdder && (
        <ThemeAdder
          existingThemeIds={themeIds}
          onAdd={handleThemesAdded}
          onCancel={() => setShowThemeAdder(false)}
        />
      )}

      {points.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Aucun point de contrôle pour les thèmes sélectionnés.
        </div>
      ) : (
        points.map((point) => {
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
              linkedDocs={(point.point_controle_doc_liens ?? [])
                .map((l) => l.base_documentaire)
                .filter((d): d is NonNullable<typeof d> => d !== null)}
            />
          );
        })
      )}

      {/* Ajout rapide */}
      <QuickAddPoint
        themeIds={themeIds}
        categorieIds={categorieIds}
        onPointCreated={(newPoint) => setPoints((prev) => [...prev, newPoint])}
      />

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
