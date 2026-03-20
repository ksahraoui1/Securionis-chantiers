"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PointControleForm } from "@/components/admin/point-controle-form";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

export default function AdminPointsControlePage() {
  const [points, setPoints] = useState<
    (Tables<"points_controle"> & {
      phases: { libelle: string; numero: number } | null;
      categories: { libelle: string } | null;
    })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPoint, setEditingPoint] =
    useState<Tables<"points_controle"> | null>(null);
  const [filterPhase, setFilterPhase] = useState("");
  const [phases, setPhases] = useState<Tables<"phases">[]>([]);

  const loadPoints = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("points_controle")
      .select("*, phases(libelle, numero), categories(libelle)")
      .order("created_at", { ascending: false });

    if (filterPhase) {
      query = query.eq("phase_id", filterPhase);
    }

    const { data } = await query;
    if (data) setPoints(data as typeof points);
    setLoading(false);
  }, [filterPhase]);

  useEffect(() => {
    loadPoints();
  }, [loadPoints]);

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

  async function handleDesactiver(id: string) {
    if (!confirm("Désactiver ce point de contrôle ?")) return;
    const supabase = createClient();
    await supabase
      .from("points_controle")
      .update({ actif: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("is_custom", true);
    loadPoints();
  }

  async function handleReactiver(id: string) {
    const supabase = createClient();
    await supabase
      .from("points_controle")
      .update({ actif: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("is_custom", true);
    loadPoints();
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Points de contrôle</h1>
        <button
          onClick={() => {
            setEditingPoint(null);
            setShowForm(true);
          }}
          className="px-4 py-3 min-h-touch bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          + Nouveau point
        </button>
      </div>

      <div className="mb-4">
        <select
          value={filterPhase}
          onChange={(e) => setFilterPhase(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Toutes les phases</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              Phase {p.numero} — {p.libelle}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 py-8 text-center">Chargement...</p>
      ) : points.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Aucun point de contrôle trouvé.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-3 min-h-touch bg-blue-600 text-white rounded-lg"
          >
            Créer un point de contrôle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {points.map((point) => (
            <div
              key={point.id}
              className={`bg-white rounded-lg border p-4 ${
                !point.actif ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        point.is_custom
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {point.is_custom ? "Personnalisé" : "SUVA"}
                    </span>
                    {!point.actif && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        Désactivé
                      </span>
                    )}
                  </div>
                  <p className="font-medium">{point.intitule}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Phase {point.phases?.numero} — {point.categories?.libelle}
                  </p>
                  {point.critere && (
                    <p className="text-xs text-gray-400 mt-1">
                      Critère : {point.critere}
                    </p>
                  )}
                </div>
                {point.is_custom && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingPoint(point);
                        setShowForm(true);
                      }}
                      className="px-3 py-2 min-h-touch text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Modifier
                    </button>
                    {point.actif ? (
                      <button
                        onClick={() => handleDesactiver(point.id)}
                        className="px-3 py-2 min-h-touch text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                      >
                        Désactiver
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactiver(point.id)}
                        className="px-3 py-2 min-h-touch text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                      >
                        Réactiver
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={
          editingPoint
            ? "Modifier le point de contrôle"
            : "Nouveau point de contrôle"
        }
      >
        <PointControleForm
          initialData={editingPoint}
          onSaved={() => {
            setShowForm(false);
            loadPoints();
          }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
