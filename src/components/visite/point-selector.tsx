"use client";

import { useState, useMemo } from "react";
import type { Tables } from "@/types/database";

interface PointSelectorProps {
  points: Tables<"points_controle">[];
  onConfirm: (selectedIds: string[]) => void;
}

export function PointSelector({ points, onConfirm }: PointSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(points.map((p) => p.id))
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return points;
    const s = search.toLowerCase();
    return points.filter((p) =>
      p.intitule.toLowerCase().includes(s) ||
      p.base_legale?.toLowerCase().includes(s)
    );
  }, [points, search]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(points.map((p) => p.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-400 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Sélection des points à contrôler
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Cochez les points de contrôle que vous souhaitez vérifier lors de cette visite.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un point..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="px-3 py-2 min-h-[44px] text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 whitespace-nowrap"
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="px-3 py-2 min-h-[44px] text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 whitespace-nowrap"
            >
              Tout décocher
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          {selectedIds.size} / {points.length} point{points.length > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
        </p>

        <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto border border-gray-200 rounded-lg">
          {filtered.map((point) => (
            <button
              key={point.id}
              type="button"
              onClick={() => toggle(point.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50/50 transition-colors text-left min-h-[44px]"
            >
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                  selectedIds.has(point.id)
                    ? "bg-blue-600 border-blue-600"
                    : "border-gray-300"
                }`}
              >
                {selectedIds.has(point.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-sm text-gray-900">{point.intitule}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 bg-gray-50 pt-4 pb-6">
        <button
          type="button"
          onClick={() => onConfirm(Array.from(selectedIds))}
          disabled={selectedIds.size === 0}
          className="w-full py-4 min-h-[44px] bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 text-lg"
        >
          Commencer le contrôle ({selectedIds.size} point{selectedIds.size > 1 ? "s" : ""})
        </button>
      </div>
    </div>
  );
}
