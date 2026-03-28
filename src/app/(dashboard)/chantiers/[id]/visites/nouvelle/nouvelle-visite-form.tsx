"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

interface NouvelleVisiteFormProps {
  chantierId: string;
  inspecteurId: string;
}

export function NouvelleVisiteForm({
  chantierId,
  inspecteurId,
}: NouvelleVisiteFormProps) {
  const router = useRouter();

  // Step 1: Categories
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState("");

  // Step 2: Themes
  const [themes, setThemes] = useState<Tables<"themes">[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  const [themeSearch, setThemeSearch] = useState("");

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingThemes, setLoadingThemes] = useState(false);

  // Load categories (new ones: phase_id IS NULL)
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("actif", true)
        .order("libelle");
      if (data) setCategories(data);
      setLoadingCats(false);
    }
    load();
  }, []);

  // Load themes when categories change
  useEffect(() => {
    if (selectedCatIds.length === 0) {
      setThemes([]);
      setSelectedThemeIds([]);
      return;
    }
    async function load() {
      setLoadingThemes(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("themes")
        .select("*, categories(libelle)")
        .in("categorie_id", selectedCatIds)
        .eq("actif", true)
        .order("libelle");
      if (data) setThemes(data as (Tables<"themes"> & { categories: { libelle: string } })[]);
      // Keep only selected themes that still belong to selected categories
      setSelectedThemeIds((prev) =>
        prev.filter((id) => data?.some((t) => t.id === id))
      );
      setLoadingThemes(false);
    }
    load();
  }, [selectedCatIds]);

  function toggleCat(id: string) {
    setSelectedCatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleTheme(id: string) {
    setSelectedThemeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAllThemes() {
    const filtered = filteredThemes.map((t) => t.id);
    setSelectedThemeIds((prev) => [...new Set([...prev, ...filtered])]);
  }

  function deselectAllThemes() {
    const filtered = new Set(filteredThemes.map((t) => t.id));
    setSelectedThemeIds((prev) => prev.filter((id) => !filtered.has(id)));
  }

  async function handleCreate() {
    if (selectedThemeIds.length === 0) return;

    setCreating(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: visite, error: insertError } = await supabase
        .from("visites")
        .insert({
          chantier_id: chantierId,
          inspecteur_id: inspecteurId,
          statut: "brouillon",
          categorie_ids: selectedCatIds,
        })
        .select("id")
        .single();

      if (insertError || !visite) {
        throw new Error(insertError?.message ?? "Erreur lors de la création");
      }

      // Store selected theme IDs in localStorage for the checklist to use
      localStorage.setItem(`visite-themes-${visite.id}`, JSON.stringify(selectedThemeIds));

      router.push(`/chantiers/${chantierId}/visites/${visite.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setCreating(false);
    }
  }

  const filteredCats = catSearch
    ? categories.filter((c) => c.libelle.toLowerCase().includes(catSearch.toLowerCase()))
    : categories;

  const filteredThemes = themeSearch
    ? themes.filter((t) => t.libelle.toLowerCase().includes(themeSearch.toLowerCase()))
    : themes;

  // Count points preview
  const totalThemes = selectedThemeIds.length;

  return (
    <div className="space-y-8">
      {/* Step 1: Categories */}
      <div>
        <h2 className="text-lg font-semibold mb-1">
          1. Sélectionnez les catégories
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Cochez les domaines à contrôler lors de cette visite.
        </p>
        <input
          type="text"
          value={catSearch}
          onChange={(e) => setCatSearch(e.target.value)}
          placeholder="Rechercher une catégorie..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 min-h-touch"
        />
        {loadingCats ? (
          <p className="text-gray-500 text-center py-4">Chargement...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
            {filteredCats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCat(cat.id)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-colors min-h-touch ${
                  selectedCatIds.includes(cat.id)
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-blue-300"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    selectedCatIds.includes(cat.id)
                      ? "bg-blue-600 border-blue-600"
                      : "border-gray-300"
                  }`}
                >
                  {selectedCatIds.includes(cat.id) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-medium truncate">{cat.libelle}</span>
              </button>
            ))}
          </div>
        )}
        {selectedCatIds.length > 0 && (
          <p className="text-xs text-blue-600 mt-2 font-medium">
            {selectedCatIds.length} catégorie{selectedCatIds.length > 1 ? "s" : ""} sélectionnée{selectedCatIds.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Step 2: Themes */}
      {selectedCatIds.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">
            2. Sélectionnez les thèmes
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Affinez les sujets de contrôle. Les points de contrôle seront filtrés selon vos choix.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={themeSearch}
              onChange={(e) => setThemeSearch(e.target.value)}
              placeholder="Rechercher un thème..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            />
            <button
              type="button"
              onClick={selectAllThemes}
              className="text-xs px-3 py-2 min-h-touch bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 whitespace-nowrap"
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={deselectAllThemes}
              className="text-xs px-3 py-2 min-h-touch bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 whitespace-nowrap"
            >
              Tout décocher
            </button>
          </div>
          {loadingThemes ? (
            <p className="text-gray-500 text-center py-4">Chargement...</p>
          ) : themes.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Aucun thème pour ces catégories.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
              {filteredThemes.map((theme) => {
                const catLabel = (theme as unknown as { categories: { libelle: string } }).categories?.libelle;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => toggleTheme(theme.id)}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-left text-sm transition-colors min-h-touch ${
                      selectedThemeIds.includes(theme.id)
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-blue-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        selectedThemeIds.includes(theme.id)
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedThemeIds.includes(theme.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{theme.libelle}</span>
                      {catLabel && selectedCatIds.length > 1 && (
                        <span className="text-[10px] text-gray-400">{catLabel}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {selectedThemeIds.length > 0 && (
            <p className="text-xs text-blue-600 mt-2 font-medium">
              {selectedThemeIds.length} thème{selectedThemeIds.length > 1 ? "s" : ""} sélectionné{selectedThemeIds.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {totalThemes > 0 && (
        <div className="sticky bottom-0 bg-gray-50 pt-4 pb-6">
          <Button
            size="lg"
            loading={creating}
            onClick={handleCreate}
            className="w-full"
          >
            Démarrer la visite ({totalThemes} thème{totalThemes > 1 ? "s" : ""})
          </Button>
        </div>
      )}
    </div>
  );
}
