"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const [phases, setPhases] = useState<Tables<"phases">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [phaseId, setPhaseId] = useState(initialData?.phase_id ?? "");
  const [categorieId, setCategorieId] = useState(
    initialData?.categorie_id ?? ""
  );
  const [intitule, setIntitule] = useState(initialData?.intitule ?? "");
  const [critere, setCritere] = useState(initialData?.critere ?? "");
  const [baseLegale, setBaseLegale] = useState(
    initialData?.base_legale ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPhases() {
      const supabase = createClient();
      const { data } = await supabase
        .from("phases")
        .select("*")
        .order("numero");
      if (data) setPhases(data);
    }
    loadPhases();
  }, []);

  useEffect(() => {
    async function loadCategories() {
      if (!phaseId) {
        setCategories([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("phase_id", phaseId)
        .eq("actif", true)
        .order("libelle");
      if (data) setCategories(data);
    }
    loadCategories();
  }, [phaseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!phaseId || !categorieId || !intitule.trim()) {
      setError("Phase, catégorie et intitulé sont obligatoires.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      if (initialData) {
        const { error: updateError } = await supabase
          .from("points_controle")
          .update({
            phase_id: phaseId,
            categorie_id: categorieId,
            intitule: intitule.trim(),
            critere: critere.trim() || null,
            base_legale: baseLegale.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", initialData.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("points_controle")
          .insert({
            phase_id: phaseId,
            categorie_id: categorieId,
            intitule: intitule.trim(),
            critere: critere.trim() || null,
            base_legale: baseLegale.trim() || null,
            is_custom: true,
          });

        if (insertError) throw insertError;
      }

      onSaved();
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Phase *
        </label>
        <select
          value={phaseId}
          onChange={(e) => {
            setPhaseId(e.target.value);
            setCategorieId("");
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch"
          required
        >
          <option value="">Sélectionner une phase</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              Phase {p.numero} — {p.libelle}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Catégorie *
        </label>
        <select
          value={categorieId}
          onChange={(e) => setCategorieId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch"
          required
          disabled={!phaseId}
        >
          <option value="">Sélectionner une catégorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Intitulé de la question *
        </label>
        <textarea
          value={intitule}
          onChange={(e) => setIntitule(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="Ex: Les garde-corps provisoires sont-ils en place ?"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Critère d'acceptation
        </label>
        <textarea
          value={critere}
          onChange={(e) => setCritere(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          placeholder="Ex: Hauteur min 1m, plinthe 15cm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Base légale (optionnel)
        </label>
        <input
          type="text"
          value={baseLegale}
          onChange={(e) => setBaseLegale(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch"
          placeholder="Ex: OTConst Art. 22"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving
            ? "Enregistrement..."
            : initialData
              ? "Modifier"
              : "Créer le point de contrôle"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
