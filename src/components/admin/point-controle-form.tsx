"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CategorieThemeSelector,
  validateCategorieThemeState,
  type CategorieThemeState,
} from "./categorie-theme-selector";
import {
  PointControleDocumentsUploader,
  type PointControleDocumentsUploaderHandle,
} from "./point-controle-documents-uploader";
import type { Tables } from "@/types/database";

interface PointControleFormProps {
  initialData?: Tables<"points_controle"> | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function PointControleForm({
  initialData,
  onSaved,
  onCancel,
}: PointControleFormProps) {
  const [catThemeState, setCatThemeState] = useState<CategorieThemeState>({
    categorie: initialData?.categorie_id
      ? { mode: "existing", categorieId: initialData.categorie_id }
      : { mode: "existing", categorieId: "" },
    theme: initialData?.theme_id
      ? { mode: "existing", themeId: initialData.theme_id }
      : { mode: "none" },
  });
  const [intitule, setIntitule] = useState(initialData?.intitule ?? "");
  const [critere, setCritere] = useState(initialData?.critere ?? "");
  const [baseLegale, setBaseLegale] = useState(initialData?.base_legale ?? "");
  const [explications, setExplications] = useState(initialData?.explications ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploaderRef = useRef<PointControleDocumentsUploaderHandle>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const selectionError = validateCategorieThemeState(catThemeState);
    if (selectionError || !intitule.trim()) {
      setError(selectionError ?? "Intitulé obligatoire.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Créer une nouvelle catégorie si nécessaire
      let finalCategorieId =
        catThemeState.categorie.mode === "existing"
          ? catThemeState.categorie.categorieId
          : "";
      if (catThemeState.categorie.mode === "new") {
        const { data: newCatData, error: catError } = await supabase
          .from("categories")
          .insert({
            libelle: catThemeState.categorie.libelle.trim(),
            phase_id: null,
            is_custom: true,
            actif: true,
          })
          .select("id")
          .single();
        if (catError) throw catError;
        finalCategorieId = newCatData.id;
      }

      // Créer un nouveau thème si nécessaire
      let finalThemeId: string | null =
        catThemeState.theme.mode === "existing" ? catThemeState.theme.themeId : null;
      if (catThemeState.theme.mode === "new") {
        const { data: newThemeData, error: themeError } = await supabase
          .from("themes")
          .insert({
            categorie_id: finalCategorieId,
            libelle: catThemeState.theme.libelle.trim(),
          })
          .select("id")
          .single();
        if (themeError) throw themeError;
        finalThemeId = newThemeData.id;
      }

      const payload = {
        phase_id: null,
        categorie_id: finalCategorieId,
        theme_id: finalThemeId,
        intitule: intitule.trim(),
        critere: critere.trim() || null,
        base_legale: baseLegale.trim() || null,
        explications: explications.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let pointId = initialData?.id;

      if (initialData) {
        const { error: updateError } = await supabase
          .from("points_controle")
          .update(payload)
          .eq("id", initialData.id);
        if (updateError) throw updateError;
      } else {
        const { data: newPoint, error: insertError } = await supabase
          .from("points_controle")
          .insert({ ...payload, is_custom: true })
          .select("id")
          .single();
        if (insertError) throw insertError;
        pointId = newPoint.id;
      }

      // Upload pending files pour le nouveau point
      if (pointId) await uploaderRef.current?.flushPending(pointId);

      onSaved();
    } catch (err) {
      console.error("[PointControleForm] submit error:", err);
      setError(
        err instanceof Error
          ? `Erreur : ${err.message}`
          : "Erreur lors de l'enregistrement.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <CategorieThemeSelector
        initialCategorieId={initialData?.categorie_id ?? null}
        initialThemeId={initialData?.theme_id ?? null}
        onChange={setCatThemeState}
      />

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Point de contrôle (action à vérifier) *
        </label>
        <textarea
          value={intitule}
          onChange={(e) => setIntitule(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Ex: Vérifier la présence de garde-corps périphériques"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Explications
        </label>
        <textarea
          value={explications}
          onChange={(e) => setExplications(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Détails complémentaires..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Base légale
          </label>
          <input
            type="text"
            value={baseLegale}
            onChange={(e) => setBaseLegale(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            placeholder="Ex: OTConst — Art. 22"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Critère d'acceptation
          </label>
          <input
            type="text"
            value={critere}
            onChange={(e) => setCritere(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            placeholder="Ex: Hauteur min 1m"
          />
        </div>
      </div>

      <PointControleDocumentsUploader
        ref={uploaderRef}
        pointId={initialData?.id ?? null}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {saving ? "Enregistrement..." : initialData ? "Modifier" : "Créer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
