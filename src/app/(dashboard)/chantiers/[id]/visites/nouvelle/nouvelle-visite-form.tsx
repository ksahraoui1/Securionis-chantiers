"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhaseSelector } from "@/components/visite/phase-selector";
import { CategorieSelector } from "@/components/visite/categorie-selector";
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
  const [selectedPhase, setSelectedPhase] = useState<Tables<"phases"> | null>(
    null
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePhaseSelect(phase: Tables<"phases">) {
    setSelectedPhase(phase);
    setSelectedCategoryIds([]);
  }

  function handleCategoriesSelect(categories: Tables<"categories">[]) {
    setSelectedCategoryIds(categories.map((c) => c.id));
  }

  async function handleCreate() {
    if (selectedCategoryIds.length === 0) return;

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
        })
        .select("id")
        .single();

      if (insertError || !visite) {
        throw new Error(insertError?.message ?? "Erreur lors de la creation");
      }

      router.push(`/chantiers/${chantierId}/visites/${visite.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue"
      );
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <PhaseSelector
        onSelect={handlePhaseSelect}
        selected={selectedPhase?.id ?? null}
      />

      {selectedPhase && (
        <CategorieSelector
          phaseId={selectedPhase.id}
          onSelect={handleCategoriesSelect}
          selected={selectedCategoryIds}
        />
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedCategoryIds.length > 0 && (
        <div className="sticky bottom-0 bg-gray-50 pt-4 pb-6">
          <Button
            size="lg"
            loading={creating}
            onClick={handleCreate}
            className="w-full"
          >
            Demarrer la visite ({selectedCategoryIds.length} categorie
            {selectedCategoryIds.length > 1 ? "s" : ""})
          </Button>
        </div>
      )}
    </div>
  );
}
