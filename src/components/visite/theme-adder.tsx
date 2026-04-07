"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

interface ThemeAdderProps {
  existingThemeIds: string[];
  onAdd: (newThemeIds: string[]) => void;
  onCancel: () => void;
}

type ThemeWithCategory = Tables<"themes"> & { categories: { libelle: string } };

export function ThemeAdder({ existingThemeIds, onAdd, onCancel }: ThemeAdderProps) {
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [themes, setThemes] = useState<ThemeWithCategory[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState("");
  const [themeSearch, setThemeSearch] = useState("");
  const [loadingThemes, setLoadingThemes] = useState(false);

  // Global keyword search
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<ThemeWithCategory[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  // Load categories
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("actif", true)
        .order("libelle");
      if (data) setCategories(data);
    }
    load();
  }, []);

  // Load themes when categories change
  useEffect(() => {
    if (selectedCatIds.length === 0) {
      setThemes([]);
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
      setSelectedThemeIds((prev) => prev.filter((id) => data?.some((t) => t.id === id)));
      setLoadingThemes(false);
    }
    load();
  }, [selectedCatIds]);

  // Global keyword search
  useEffect(() => {
    if (globalSearch.trim().length < 2) {
      setGlobalResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoadingGlobal(true);
      const supabase = createClient();
      const keyword = globalSearch.trim().toLowerCase();

      const { data: themeResults } = await supabase
        .from("themes")
        .select("*, categories(libelle)")
        .eq("actif", true)
        .ilike("libelle", `%${keyword}%`)
        .order("libelle")
        .limit(100);

      const { data: catResults } = await supabase
        .from("categories")
        .select("id")
        .eq("actif", true)
        .ilike("libelle", `%${keyword}%`);

      let catThemes: ThemeWithCategory[] = [];
      if (catResults && catResults.length > 0) {
        const catIds = catResults.map((c) => c.id);
        const { data } = await supabase
          .from("themes")
          .select("*, categories(libelle)")
          .in("categorie_id", catIds)
          .eq("actif", true)
          .order("libelle")
          .limit(200);
        if (data) catThemes = data as ThemeWithCategory[];
      }

      const allThemes = [...(themeResults as ThemeWithCategory[] || []), ...catThemes];
      const unique = Array.from(new Map(allThemes.map((t) => [t.id, t])).values());
      setGlobalResults(unique);
      setLoadingGlobal(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [globalSearch]);

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

  function toggleGlobalTheme(theme: ThemeWithCategory) {
    const isSelected = selectedThemeIds.includes(theme.id);
    if (isSelected) {
      setSelectedThemeIds((prev) => prev.filter((x) => x !== theme.id));
    } else {
      setSelectedThemeIds((prev) => [...prev, theme.id]);
      if (!selectedCatIds.includes(theme.categorie_id)) {
        setSelectedCatIds((prev) => [...prev, theme.categorie_id]);
      }
    }
  }

  const filteredCats = catSearch
    ? categories.filter((c) => c.libelle.toLowerCase().includes(catSearch.toLowerCase()))
    : categories;

  const filteredThemes = themeSearch
    ? themes.filter((t) => t.libelle.toLowerCase().includes(themeSearch.toLowerCase()))
    : themes;

  // Only show themes not already in the visit
  const newThemes = filteredThemes.filter((t) => !existingThemeIds.includes(t.id));
  const newGlobalResults = globalResults.filter((t) => !existingThemeIds.includes(t.id));

  const newSelectedCount = selectedThemeIds.filter((id) => !existingThemeIds.includes(id)).length;

  const isGlobalMode = globalSearch.trim().length >= 2;

  const globalGrouped = newGlobalResults.reduce<Record<string, { catLabel: string; catId: string; themes: ThemeWithCategory[] }>>((acc, theme) => {
    const catId = theme.categorie_id;
    if (!acc[catId]) {
      acc[catId] = { catLabel: theme.categories.libelle, catId, themes: [] };
    }
    acc[catId].themes.push(theme);
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-lg border-2 border-green-300 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Ajouter des catégories / thèmes</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Global keyword search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Recherche par mot-cl\u00e9..."
          className="w-full rounded-lg border border-gray-300 pl-9 pr-8 py-2 text-sm min-h-touch"
        />
        {globalSearch && (
          <button
            type="button"
            onClick={() => setGlobalSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Global search results */}
      {isGlobalMode && (
        <div>
          {loadingGlobal ? (
            <p className="text-gray-400 text-xs text-center py-2">Recherche...</p>
          ) : newGlobalResults.length === 0 ? (
            <p className="text-gray-400 text-xs text-center py-2">Aucun nouveau th\u00e8me trouv\u00e9</p>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {Object.values(globalGrouped).map((group) => (
                <div key={group.catId}>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{group.catLabel}</h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.themes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => toggleGlobalTheme(theme)}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border text-left text-xs transition-colors min-h-touch ${
                          selectedThemeIds.includes(theme.id)
                            ? "border-green-600 bg-green-50"
                            : "border-gray-200 bg-white hover:border-green-300"
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
                            selectedThemeIds.includes(theme.id)
                              ? "bg-green-600 border-green-600"
                              : "border-gray-300"
                          }`}
                        >
                          {selectedThemeIds.includes(theme.id) && (
                            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{theme.libelle}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Catégories (hidden during global search) */}
      {!isGlobalMode && <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Catégories</label>
        <input
          type="text"
          value={catSearch}
          onChange={(e) => setCatSearch(e.target.value)}
          placeholder="Rechercher une catégorie..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 min-h-touch"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto">
          {filteredCats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggleCat(cat.id)}
              className={`flex items-center gap-1.5 p-2 rounded-lg border text-left text-xs transition-colors min-h-touch ${
                selectedCatIds.includes(cat.id)
                  ? "border-green-600 bg-green-50"
                  : "border-gray-200 bg-white hover:border-green-300"
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
                  selectedCatIds.includes(cat.id)
                    ? "bg-green-600 border-green-600"
                    : "border-gray-300"
                }`}
              >
                {selectedCatIds.includes(cat.id) && (
                  <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="truncate">{cat.libelle}</span>
            </button>
          ))}
        </div>
      </div>}

      {/* Thèmes (hidden during global search) */}
      {!isGlobalMode && selectedCatIds.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">
            Thèmes {newThemes.length > 0 && `(${newThemes.length} disponibles)`}
          </label>
          <input
            type="text"
            value={themeSearch}
            onChange={(e) => setThemeSearch(e.target.value)}
            placeholder="Rechercher un thème..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 min-h-touch"
          />
          {loadingThemes ? (
            <p className="text-gray-400 text-xs text-center py-2">Chargement...</p>
          ) : newThemes.length === 0 ? (
            <p className="text-gray-400 text-xs text-center py-2">
              Tous les thèmes de ces catégories sont déjà dans la visite.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
              {newThemes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => toggleTheme(theme.id)}
                  className={`flex items-start gap-1.5 p-2 rounded-lg border text-left text-xs transition-colors min-h-touch ${
                    selectedThemeIds.includes(theme.id)
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 bg-white hover:border-green-300"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                      selectedThemeIds.includes(theme.id)
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedThemeIds.includes(theme.id) && (
                      <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate">{theme.libelle}</span>
                    {selectedCatIds.length > 1 && (
                      <span className="text-[10px] text-gray-400">{theme.categories.libelle}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onAdd(selectedThemeIds)}
          disabled={newSelectedCount === 0}
          className="flex-1 py-3 min-h-touch bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          Ajouter {newSelectedCount > 0 ? `${newSelectedCount} thème${newSelectedCount > 1 ? "s" : ""}` : ""}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-3 min-h-touch bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
