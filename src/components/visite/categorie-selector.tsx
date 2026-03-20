"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

interface CategorieSelectorProps {
  phaseId: string;
  onSelect: (categories: Tables<"categories">[]) => void;
  selected: string[];
}

export function CategorieSelector({
  phaseId,
  onSelect,
  selected,
}: CategorieSelectorProps) {
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("phase_id", phaseId)
        .eq("actif", true)
        .order("libelle");
      if (data) setCategories(data);
      setLoading(false);
    }
    load();
  }, [phaseId]);

  function toggleCategory(cat: Tables<"categories">) {
    const isSelected = selected.includes(cat.id);
    let newSelected: Tables<"categories">[];
    if (isSelected) {
      newSelected = categories.filter(
        (c) => selected.includes(c.id) && c.id !== cat.id
      );
    } else {
      const newIds = [...selected, cat.id];
      newSelected = categories.filter((c) => newIds.includes(c.id));
    }
    onSelect(newSelected);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Chargement des catégories...</div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Aucune catégorie pour cette phase.
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        Sélectionnez les sujets de contrôle
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        Vous pouvez sélectionner plusieurs sujets.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => toggleCategory(cat)}
            className={`p-4 rounded-lg border-2 text-left transition-colors min-h-touch ${
              selected.includes(cat.id)
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200 bg-white hover:border-blue-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  selected.includes(cat.id)
                    ? "bg-blue-600 border-blue-600"
                    : "border-gray-300"
                }`}
              >
                {selected.includes(cat.id) && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <span className="font-medium">{cat.libelle}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
