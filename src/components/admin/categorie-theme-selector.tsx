"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

export type CategorieSelection =
  | { mode: "existing"; categorieId: string }
  | { mode: "new"; libelle: string };

export type ThemeSelection =
  | { mode: "none" }
  | { mode: "existing"; themeId: string }
  | { mode: "new"; libelle: string };

export interface CategorieThemeState {
  categorie: CategorieSelection;
  theme: ThemeSelection;
}

interface Props {
  initialCategorieId: string | null;
  initialThemeId: string | null;
  onChange: (state: CategorieThemeState) => void;
}

export function CategorieThemeSelector({
  initialCategorieId,
  initialThemeId,
  onChange,
}: Props) {
  const [categorie, setCategorie] = useState<CategorieSelection>(
    initialCategorieId
      ? { mode: "existing", categorieId: initialCategorieId }
      : { mode: "existing", categorieId: "" },
  );
  const [theme, setTheme] = useState<ThemeSelection>(
    initialThemeId ? { mode: "existing", themeId: initialThemeId } : { mode: "none" },
  );

  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [themes, setThemes] = useState<Tables<"themes">[]>([]);

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

  const currentCategorieId =
    categorie.mode === "existing" ? categorie.categorieId : "";

  useEffect(() => {
    async function load() {
      if (!currentCategorieId) {
        setThemes([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("themes")
        .select("*")
        .eq("categorie_id", currentCategorieId)
        .eq("actif", true)
        .order("libelle");
      if (data) setThemes(data);
    }
    load();
  }, [currentCategorieId]);

  // La ref sert à ne pas relancer l'effet quand le parent recrée `onChange`.
  // ⚠️ Son écriture doit se faire dans un effet, jamais pendant le rendu :
  // React peut rendre un composant sans le valider (rendu concurrent,
  // StrictMode), et une ref mutée pendant le rendu part alors en avance sur
  // l'état réellement affiché.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onChangeRef.current({ categorie, theme });
  }, [categorie, theme]);

  function toggleNewCategorie() {
    if (categorie.mode === "existing") {
      setCategorie({ mode: "new", libelle: "" });
      setTheme({ mode: "new", libelle: "" });
    } else {
      setCategorie({ mode: "existing", categorieId: "" });
      setTheme({ mode: "none" });
    }
  }

  function toggleNewTheme() {
    if (theme.mode === "new") {
      setTheme({ mode: "existing", themeId: "" });
    } else {
      setTheme({ mode: "new", libelle: "" });
    }
  }

  const themeToggleVisible =
    categorie.mode === "new" ||
    (categorie.mode === "existing" && categorie.categorieId !== "");

  const themeAsInput =
    theme.mode === "new" || categorie.mode === "new";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-500">Catégorie *</label>
          <button
            type="button"
            onClick={toggleNewCategorie}
            className="text-[10px] text-blue-600 hover:underline"
          >
            {categorie.mode === "new" ? "Choisir existante" : "+ Nouvelle catégorie"}
          </button>
        </div>
        {categorie.mode === "new" ? (
          <input
            type="text"
            value={categorie.libelle}
            onChange={(e) => setCategorie({ mode: "new", libelle: e.target.value })}
            className="w-full rounded-lg border border-blue-300 px-3 py-3 min-h-touch text-sm bg-blue-50"
            placeholder="Nom de la nouvelle catégorie"
          />
        ) : (
          <select
            value={categorie.categorieId}
            onChange={(e) => {
              setCategorie({ mode: "existing", categorieId: e.target.value });
              setTheme({ mode: "none" });
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            required
          >
            <option value="">Sélectionner</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.libelle}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-500">Thème</label>
          {themeToggleVisible && categorie.mode !== "new" && (
            <button
              type="button"
              onClick={toggleNewTheme}
              className="text-[10px] text-blue-600 hover:underline"
            >
              {theme.mode === "new" ? "Choisir existant" : "+ Nouveau thème"}
            </button>
          )}
        </div>
        {themeAsInput ? (
          <input
            type="text"
            value={theme.mode === "new" ? theme.libelle : ""}
            onChange={(e) => setTheme({ mode: "new", libelle: e.target.value })}
            className="w-full rounded-lg border border-blue-300 px-3 py-3 min-h-touch text-sm bg-blue-50"
            placeholder="Nom du nouveau thème"
          />
        ) : (
          <select
            value={theme.mode === "existing" ? theme.themeId : ""}
            onChange={(e) => {
              const id = e.target.value;
              setTheme(id ? { mode: "existing", themeId: id } : { mode: "none" });
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-touch text-sm"
            disabled={!currentCategorieId}
          >
            <option value="">Aucun thème</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.libelle}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export function validateCategorieThemeState(
  state: CategorieThemeState,
): string | null {
  if (state.categorie.mode === "existing" && !state.categorie.categorieId) {
    return "Catégorie obligatoire.";
  }
  if (state.categorie.mode === "new" && !state.categorie.libelle.trim()) {
    return "Catégorie obligatoire.";
  }
  if (state.theme.mode === "new" && !state.theme.libelle.trim()) {
    return "Thème obligatoire.";
  }
  return null;
}
