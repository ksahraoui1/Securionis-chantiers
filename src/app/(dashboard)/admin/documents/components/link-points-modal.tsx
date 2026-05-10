"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";

interface LinkablePoint {
  id: string;
  intitule: string;
  linked: boolean;
}

interface Props {
  docId: string | null;
  onClose: () => void;
}

export function LinkPointsModal({ docId, onClose }: Props) {
  const [points, setPoints] = useState<LinkablePoint[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    async function load() {
      setSearch("");
      setLoading(true);
      const supabase = createClient();
      const [allPointsRes, existingLiensRes] = await Promise.all([
        supabase
          .from("points_controle")
          .select("id, intitule")
          .eq("actif", true)
          .not("theme_id", "is", null)
          .order("intitule")
          .limit(500),
        supabase
          .from("point_controle_doc_liens")
          .select("point_controle_id")
          .eq("document_id", docId),
      ]);

      if (cancelled) return;

      const linkedIds = new Set(
        existingLiensRes.data?.map((l) => l.point_controle_id) ?? [],
      );
      setPoints(
        (allPointsRes.data ?? []).map((p) => ({
          id: p.id,
          intitule: p.intitule,
          linked: linkedIds.has(p.id),
        })),
      );
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  async function toggleLink(pointId: string) {
    if (!docId) return;
    const supabase = createClient();
    const point = points.find((p) => p.id === pointId);
    if (!point) return;

    if (point.linked) {
      await supabase
        .from("point_controle_doc_liens")
        .delete()
        .eq("document_id", docId)
        .eq("point_controle_id", pointId);
    } else {
      await supabase
        .from("point_controle_doc_liens")
        .insert({ document_id: docId, point_controle_id: pointId });
    }

    setPoints((prev) =>
      prev.map((p) => (p.id === pointId ? { ...p, linked: !p.linked } : p)),
    );
  }

  const filtered = search
    ? points.filter((p) =>
        p.intitule.toLowerCase().includes(search.toLowerCase()),
      )
    : points;
  const linkedTotal = points.filter((p) => p.linked).length;

  return (
    <Modal isOpen={!!docId} onClose={onClose} title="Lier aux points de contrôle">
      <div className="space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un point de contrôle..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
        />
        <p className="text-xs text-gray-500">
          {linkedTotal} point{linkedTotal > 1 ? "s" : ""} lié
          {linkedTotal > 1 ? "s" : ""}
        </p>
        {loading ? (
          <p className="text-gray-400 text-center py-4">Chargement...</p>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1">
            {[...filtered]
              .sort((a, b) =>
                a.linked === b.linked ? 0 : a.linked ? -1 : 1,
              )
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleLink(p.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors ${
                    p.linked
                      ? "bg-green-50 border border-green-200"
                      : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      p.linked
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {p.linked && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
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
                  <span
                    className={p.linked ? "text-green-800" : "text-gray-700"}
                  >
                    {p.intitule}
                  </span>
                </button>
              ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 min-h-touch bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 text-sm"
        >
          Fermer
        </button>
      </div>
    </Modal>
  );
}
