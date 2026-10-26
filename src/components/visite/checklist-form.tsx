"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { offlinePreferenceKey, assertOfflineScope } from "@/lib/offline/scope";
import { getUnsyncedResponses } from "@/lib/offline/db";
import { ChecklistItem } from "./checklist-item";
import { PointSelector } from "./point-selector";
import { SelecteurPoints } from "./selecteur-points";
import { deduireRattachements, type PointSelectionnable } from "@/lib/visites/selection-points";
import { useAutosave } from "@/hooks/use-autosave";
import type { Tables } from "@/types/database";
import { signerUrls } from "@/lib/utils/url-signee";

type LinkedDoc = {
  base_documentaire: { id: string; titre: string; fichier_url: string; type_fichier: string } | null;
};

type PointWithDocs = Tables<"points_controle"> & {
  point_controle_documents?: Tables<"point_controle_documents">[];
  point_controle_doc_liens?: LinkedDoc[];
};

const SELECT_POINT_CHECKLIST =
  "*, themes(libelle), point_controle_documents(*), point_controle_doc_liens(base_documentaire(id, titre, fichier_url, type_fichier))";

// Bucket privé (SEC-03) : les fiches jointes aux points de contrôle
// (documents propres et base documentaire) se servent par URL signée.
// Un seul appel pour tous les points fournis.
async function signerDocuments(
  supabase: ReturnType<typeof createClient>,
  brut: PointWithDocs[],
): Promise<PointWithDocs[]> {
  const aSigner: string[] = [];
  brut.forEach((p) => {
    (p.point_controle_documents ?? []).forEach((d) => aSigner.push(d.fichier_url));
    (p.point_controle_doc_liens ?? []).forEach((l) => {
      if (l.base_documentaire) aSigner.push(l.base_documentaire.fichier_url);
    });
  });
  const signees = await signerUrls(supabase, aSigner);
  let k = 0;
  return brut.map((p) => ({
    ...p,
    point_controle_documents: (p.point_controle_documents ?? []).map((d) => ({
      ...d,
      fichier_url: signees[k++] ?? d.fichier_url,
    })),
    point_controle_doc_liens: (p.point_controle_doc_liens ?? []).map((l) =>
      l.base_documentaire
        ? {
            ...l,
            base_documentaire: {
              ...l.base_documentaire,
              fichier_url: signees[k++] ?? l.base_documentaire.fichier_url,
            },
          }
        : l,
    ),
  }));
}

interface ChecklistFormProps {
  visiteId: string;
  chantierId: string;
  categorieIds: string[];
  existingReponses: Record<
    string,
    { id: string; valeur: string; remarque: string | null; photos: string[]; base_revision?: string | null; local_revision?: string }
  >;
  onValidate: () => void;
  validating: boolean;
  editingDisabled?: boolean;
  peutCreerPoint?: boolean;
}

export function ChecklistForm({
  visiteId,
  chantierId,
  categorieIds,
  existingReponses,
  onValidate,
  validating,
  editingDisabled = false,
  peutCreerPoint = false,
}: ChecklistFormProps) {
  const scope = useOfflineScope();
  const [restoredResponses, setRestoredResponses] = useState(existingReponses);
  const [restoreError, setRestoreError] = useState(false);
  const [allPoints, setAllPoints] = useState<PointWithDocs[]>([]);
  const [points, setPoints] = useState<PointWithDocs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAjout, setShowAjout] = useState(false);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [ajoutErreur, setAjoutErreur] = useState<string | null>(null);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [selectionDone, setSelectionDone] = useState(false);
  const { save, saveStatus } = useAutosave(visiteId);

  // Load points based on current themeIds
  const loadPoints = useCallback(async (currentThemeIds: string[]) => {
    try {
    const pending = (await getUnsyncedResponses(scope)).filter(r => r.visite_id === visiteId);
    const restored = { ...existingReponses };
    for (const r of pending) restored[r.point_controle_id] = { id: existingReponses[r.point_controle_id]?.id ?? r.point_controle_id, valeur: r.valeur, remarque: r.remarque, photos: r.photos, base_revision: r.base_revision, local_revision: r.revision };
    assertOfflineScope(scope);
    setRestoredResponses(restored);
    const supabase = createClient();

    let query = supabase
      .from("points_controle")
      .select(SELECT_POINT_CHECKLIST)
      .eq("actif", true)
      .order("intitule");

    if (currentThemeIds.length > 0) {
      query = query.in("theme_id", currentThemeIds);
    } else if (categorieIds.length > 0) {
      query = query.in("categorie_id", categorieIds);
    }

    const { data } = await query;
    if (data) {
      const loaded = await signerDocuments(supabase, data as PointWithDocs[]);
      setAllPoints(loaded);

      // Si des réponses existent déjà, on saute la sélection (visite reprise)
      const hasExistingReponses = Object.keys(restored).length > 0;
      if (hasExistingReponses) {
        setPoints(loaded);
        setSelectionDone(true);
      } else {
        // Vérifier si une sélection précédente existe en localStorage
        const storedSelection = localStorage.getItem(offlinePreferenceKey(scope, `visite-selected-points-${visiteId}`));
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
    } catch { if (!scope.signal.aborted) { setRestoreError(true); setLoading(false); } }
  }, [scope, visiteId, categorieIds, existingReponses]);

  // Initial load
  useEffect(() => {
    let initialThemeIds: string[] = [];
    try {
      const stored = localStorage.getItem(offlinePreferenceKey(scope, `visite-themes-${visiteId}`));
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) initialThemeIds = parsed.filter((id): id is string => typeof id === "string");
    } catch { /* La restauration IndexedDB reste obligatoire ci-dessous. */ }
    setThemeIds(initialThemeIds);

    loadPoints(initialThemeIds);
  }, [scope, categorieIds, visiteId, loadPoints]);

  // Ajout de points en cours de visite — les points existants et leurs
  // réponses restent en place, seuls les nouveaux sont chargés.
  async function handlePointsAdded(choisis: PointSelectionnable[]) {
    const existingIds = new Set(points.map((p) => p.id));
    const nouveaux = choisis.filter((p) => !existingIds.has(p.id));
    if (nouveaux.length === 0) {
      setShowAjout(false);
      return;
    }
    setAjoutEnCours(true);
    setAjoutErreur(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("points_controle")
        .select(SELECT_POINT_CHECKLIST)
        .in("id", nouveaux.map((p) => p.id))
        .order("intitule");
      if (error || !data) throw error ?? new Error("lecture");
      const toAdd = await signerDocuments(supabase, data as PointWithDocs[]);

      const merged = [...new Set([...themeIds, ...deduireRattachements(nouveaux).themeIds])];
      setThemeIds(merged);
      localStorage.setItem(offlinePreferenceKey(scope, `visite-themes-${visiteId}`), JSON.stringify(merged));
      setAllPoints((prev) => [...prev.filter((p) => !toAdd.some((n) => n.id === p.id)), ...toAdd]);
      const updated = [...points, ...toAdd];
      setPoints(updated);
      // Mettre à jour la sélection sauvegardée
      localStorage.setItem(
        offlinePreferenceKey(scope, `visite-selected-points-${visiteId}`),
        JSON.stringify(updated.map((p) => p.id)),
      );
      setShowAjout(false);
    } catch {
      setAjoutErreur("Impossible de charger les points choisis. Vérifiez la connexion et réessayez.");
    } finally {
      setAjoutEnCours(false);
    }
  }

  // Handle point selection confirmation
  function handleSelectionConfirm(selectedIds: string[]) {
    const selectedSet = new Set(selectedIds);
    setPoints(allPoints.filter((p) => selectedSet.has(p.id)));
    setSelectionDone(true);
    // Sauvegarder la sélection pour reprise
    localStorage.setItem(offlinePreferenceKey(scope, `visite-selected-points-${visiteId}`), JSON.stringify(selectedIds));
  }

  const handleChange = useCallback(
    (data: {
      point_controle_id: string;
      valeur: string;
      remarque: string | null;
      photos: string[];
      origin: import("@/lib/offline/db").ResponseOrigin;
    }) => {
      save({
        visite_id: visiteId,
        point_controle_id: data.point_controle_id,
        valeur: data.valeur,
        remarque: data.remarque,
        photos: data.photos,
        origin: data.origin,
      });
    },
    [save, visiteId]
  );

  if (restoreError) return <p role="alert" className="text-red-700">Impossible de reprendre les données locales. Rechargez la page avant de modifier cette visite.</p>;

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
        <span className="text-xs text-gray-400">
          {saveStatus === "saving" && "Enregistrement..."}
          {saveStatus === "saved" && "Enregistré"}
          {saveStatus === "saved-offline" && "Sauvegardé hors-ligne"}
          {saveStatus === "conflict" && "Saisie conservée — vérification requise"}
          {saveStatus === "error" && "Erreur de sauvegarde"}
        </span>
      </div>

      <fieldset disabled={editingDisabled} className="min-w-0 space-y-4">
      {points.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Aucun point de contrôle pour les thèmes sélectionnés.
        </div>
      ) : (
        points.map((point) => {
          const existing = restoredResponses[point.id];
          return (
            <ChecklistItem
              key={point.id}
              pointControle={point}
              chantierId={chantierId}
              visiteId={visiteId}
              reponseId={existing?.id ?? point.id}
              initialOrigin={existing ? { base_revision: existing.base_revision, local_revision: existing.local_revision } : { base_revision: null }}
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

      {/* Ajout de points existants ou nouveaux */}
      {showAjout ? (
        <div className="rounded-lg border border-green-300 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Ajouter des points</h2>
            <button
              type="button"
              onClick={() => setShowAjout(false)}
              aria-label="Fermer"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              <span translate="no" className="material-symbols-outlined">close</span>
            </button>
          </div>
          {ajoutErreur && <p role="alert" className="text-sm text-red-700">{ajoutErreur}</p>}
          <SelecteurPoints
            peutCreer={peutCreerPoint}
            dejaPresents={points.map((p) => p.id)}
            enCours={ajoutEnCours}
            libelleAction={(n) => (n === 0 ? "Cochez au moins un point" : `Ajouter ${n} point${n > 1 ? "s" : ""}`)}
            onConfirm={handlePointsAdded}
            onCancel={() => setShowAjout(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAjout(true)}
          className="w-full py-3 min-h-[44px] text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
        >
          <span translate="no" className="material-symbols-outlined text-lg">add</span>
          Ajouter des points{peutCreerPoint ? " (existants ou nouveaux)" : ""}
        </button>
      )}

      </fieldset>

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
