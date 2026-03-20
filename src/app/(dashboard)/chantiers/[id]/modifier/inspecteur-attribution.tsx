"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface InspecteurAttributionProps {
  chantierId: string;
  currentInspecteurs: { id: string; inspecteur_id: string; nom: string }[];
  allInspecteurs: { id: string; nom: string; email: string }[];
}

export function InspecteurAttribution({
  chantierId,
  currentInspecteurs: initialInspecteurs,
  allInspecteurs,
}: InspecteurAttributionProps) {
  const router = useRouter();
  const [currentInspecteurs, setCurrentInspecteurs] =
    useState(initialInspecteurs);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIds = currentInspecteurs.map((ci) => ci.inspecteur_id);
  const availableInspecteurs = allInspecteurs.filter(
    (insp) => !currentIds.includes(insp.id)
  );

  async function handleAdd() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("chantier_inspecteurs")
        .insert({ chantier_id: chantierId, inspecteur_id: selectedId })
        .select("id, inspecteur_id")
        .single();

      if (insertError) throw new Error(insertError.message);

      const insp = allInspecteurs.find((i) => i.id === selectedId);
      setCurrentInspecteurs([
        ...currentInspecteurs,
        {
          id: data.id,
          inspecteur_id: data.inspecteur_id,
          nom: insp?.nom ?? "Inconnu",
        },
      ]);
      setSelectedId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(linkId: string) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("chantier_inspecteurs")
        .delete()
        .eq("id", linkId);

      if (deleteError) throw new Error(deleteError.message);

      setCurrentInspecteurs(
        currentInspecteurs.filter((ci) => ci.id !== linkId)
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Inspecteurs attribues">
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {currentInspecteurs.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">
          Aucun inspecteur attribue.
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {currentInspecteurs.map((ci) => (
            <li
              key={ci.id}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-gray-900">{ci.nom}</span>
              <button
                type="button"
                onClick={() => handleRemove(ci.id)}
                disabled={loading}
                className="text-red-600 hover:text-red-800 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {availableInspecteurs.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 min-h-[44px] text-sm"
          >
            <option value="">Selectionner un inspecteur</option>
            {availableInspecteurs.map((insp) => (
              <option key={insp.id} value={insp.id}>
                {insp.nom} ({insp.email})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            loading={loading}
            disabled={!selectedId}
            onClick={handleAdd}
          >
            Ajouter
          </Button>
        </div>
      )}
    </Card>
  );
}
