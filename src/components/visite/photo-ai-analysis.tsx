"use client";

import { useState } from "react";
import { stripMarkdown } from "@/lib/utils/constants";

interface Danger {
  type: "equipement_manquant" | "zone_risque" | "non_conformite";
  description: string;
  severite: "critique" | "majeur" | "mineur";
}

interface AnalysisResult {
  dangers: Danger[];
  remarqueSuggeree: string;
  conformite: "conforme" | "non_conforme" | "indetermine";
  confiance: number;
  error?: string;
}

interface PhotoAiAnalysisProps {
  photoUrl: string;
  pointControle?: string;
  critere?: string;
  onApplyRemarque: (remarque: string) => void;
  onApplyConformite: (valeur: string) => void;
}

const SEVERITE_CONFIG: Record<string, { icon: string; bg: string; bgSelected: string; text: string }> = {
  critique: { icon: "emergency", bg: "bg-red-50", bgSelected: "bg-red-100", text: "text-red-800" },
  majeur: { icon: "warning", bg: "bg-amber-50", bgSelected: "bg-amber-100", text: "text-amber-800" },
  mineur: { icon: "info", bg: "bg-blue-50", bgSelected: "bg-blue-100", text: "text-blue-800" },
};

const TYPE_LABELS: Record<string, string> = {
  equipement_manquant: "Équipement manquant",
  zone_risque: "Zone à risque",
  non_conformite: "Non-conformité",
};

export function PhotoAiAnalysis({
  photoUrl,
  pointControle,
  critere,
  onApplyRemarque,
  onApplyConformite,
}: PhotoAiAnalysisProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDangers, setSelectedDangers] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<{ remarque: boolean; conformite: boolean }>({
    remarque: false,
    conformite: false,
  });

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedDangers(new Set());
    setApplied({ remarque: false, conformite: false });

    try {
      const res = await fetch("/api/photos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: photoUrl, pointControle, critere }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Erreur d'analyse");
      }

      // Nettoyer le markdown des textes IA
      if (data.remarqueSuggeree) data.remarqueSuggeree = stripMarkdown(data.remarqueSuggeree);
      if (data.dangers) {
        data.dangers = data.dangers.map((d: Danger) => ({
          ...d,
          description: stripMarkdown(d.description),
        }));
      }
      setResult(data);
      // Sélectionner tous les dangers par défaut
      if (data.dangers?.length > 0) {
        setSelectedDangers(new Set(data.dangers.map((_: Danger, i: number) => i)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }

  function toggleDanger(index: number) {
    setSelectedDangers((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    // Réinitialiser l'état "appliquée" quand la sélection change
    setApplied((prev) => ({ ...prev, remarque: false }));
  }

  function buildRemarqueFromSelection(): string {
    if (!result) return "";
    const selected = result.dangers.filter((_, i) => selectedDangers.has(i));
    if (selected.length === 0) return "";
    return selected.map((d) => d.description).join(". ") + ".";
  }

  function handleApplyRemarque() {
    const remarque = buildRemarqueFromSelection();
    if (remarque) {
      onApplyRemarque(remarque);
      setApplied((prev) => ({ ...prev, remarque: true }));
    }
  }

  function handleApplyConformite() {
    if (result?.conformite && result.conformite !== "indetermine") {
      onApplyConformite(result.conformite);
      setApplied((prev) => ({ ...prev, conformite: true }));
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 min-h-touch bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 disabled:opacity-50 transition-colors"
      >
        <span className="material-symbols-outlined text-lg">
          {loading ? "hourglass_top" : "auto_awesome"}
        </span>
        {loading ? "Analyse en cours..." : "Analyse IA"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <span className="material-symbols-outlined text-lg mt-0.5">error</span>
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-purple-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              Analyse IA
            </span>
            {result.confiance > 0 && (
              <span className="text-[10px] text-purple-600">
                Confiance : {Math.round(result.confiance * 100)}%
              </span>
            )}
          </div>

          {/* Dangers avec checkboxes */}
          {result.dangers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 uppercase font-medium">
                Sélectionnez les constats à retenir :
              </p>
              {result.dangers.map((d, i) => {
                const cfg = SEVERITE_CONFIG[d.severite] ?? SEVERITE_CONFIG.mineur;
                const isSelected = selectedDangers.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDanger(i)}
                    className={`w-full flex items-start gap-2 rounded-lg p-2.5 text-left transition-all ${
                      isSelected ? cfg.bgSelected : cfg.bg + " opacity-50"
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? "bg-purple-600 border-purple-600"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`material-symbols-outlined text-lg mt-0.5 ${cfg.text}`}>
                      {cfg.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold uppercase ${cfg.text}`}>
                          {d.severite}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {TYPE_LABELS[d.type] ?? d.type}
                        </span>
                      </div>
                      <p className={`text-sm mt-0.5 ${isSelected ? "text-gray-900" : "text-gray-400 line-through"}`}>
                        {d.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {result.dangers.length === 0 && result.conformite === "conforme" && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-100 rounded-lg p-2.5">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              Aucun danger détecté — la photo semble conforme.
            </div>
          )}

          {result.dangers.length === 0 && result.conformite === "indetermine" && (
            <p className="text-sm text-gray-600">
              L&apos;analyse n&apos;a pas pu déterminer la conformité de cette photo.
            </p>
          )}

          {/* Remarque construite à partir de la sélection */}
          {selectedDangers.size > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Remarque ({selectedDangers.size} constat{selectedDangers.size > 1 ? "s" : ""} retenu{selectedDangers.size > 1 ? "s" : ""})
              </p>
              <p className="text-sm text-gray-900">
                {buildRemarqueFromSelection()}
              </p>
              <button
                type="button"
                onClick={handleApplyRemarque}
                disabled={applied.remarque}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-touch ${
                  applied.remarque
                    ? "bg-green-100 text-green-700"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {applied.remarque ? "check" : "content_paste"}
                </span>
                {applied.remarque ? "Appliquée" : "Utiliser cette remarque"}
              </button>
            </div>
          )}

          {/* Conformity suggestion */}
          {result.conformite !== "indetermine" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Suggestion :</span>
              <button
                type="button"
                onClick={handleApplyConformite}
                disabled={applied.conformite}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-touch ${
                  applied.conformite
                    ? "bg-green-100 text-green-700"
                    : result.conformite === "non_conforme"
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {applied.conformite
                    ? "check"
                    : result.conformite === "non_conforme"
                      ? "cancel"
                      : "check_circle"}
                </span>
                {applied.conformite
                  ? "Appliqué"
                  : result.conformite === "non_conforme"
                    ? "Marquer Non-conforme"
                    : "Marquer Conforme"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
