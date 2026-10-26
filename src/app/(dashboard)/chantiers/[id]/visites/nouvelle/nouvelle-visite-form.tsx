"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { offlinePreferenceKey } from "@/lib/offline/scope";
import { createOfflineClient } from "@/lib/offline/client";
import { SelecteurPoints } from "@/components/visite/selecteur-points";
import { deduireRattachements, type PointSelectionnable } from "@/lib/visites/selection-points";

interface NouvelleVisiteFormProps {
  chantierId: string;
  inspecteurId: string;
  peutCreerPoint: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function NouvelleVisiteForm({
  chantierId,
  inspecteurId,
  peutCreerPoint,
}: NouvelleVisiteFormProps) {
  const scope = useOfflineScope();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catégories de la dernière visite (flux de préparation), proposées en
  // premier filtre plutôt que présélectionnées : l'inspecteur coche ses points.
  const categoriesParam = searchParams.get("categories");
  const categoriesInitiales = useMemo(
    () => (categoriesParam ?? "").split(",").filter((id) => UUID.test(id)),
    [categoriesParam],
  );

  async function handleCreate(points: PointSelectionnable[]) {
    if (points.length === 0) return;
    setCreating(true);
    setError(null);

    const { themeIds, categorieIds } = deduireRattachements(points);

    try {
      const supabase = await createOfflineClient(scope);
      const { data: visite, error: insertError } = await supabase
        .from("visites")
        .insert({
          chantier_id: chantierId,
          inspecteur_id: inspecteurId,
          statut: "brouillon",
          categorie_ids: categorieIds,
        })
        .select("id")
        .single();

      if (insertError || !visite) {
        throw new Error(insertError?.message ?? "Erreur lors de la création");
      }

      // La checklist charge les points par thème puis ne garde que la
      // sélection : les deux clés ensemble lui évitent de redemander le choix.
      localStorage.setItem(offlinePreferenceKey(scope, `visite-themes-${visite.id}`), JSON.stringify(themeIds));
      localStorage.setItem(
        offlinePreferenceKey(scope, `visite-selected-points-${visite.id}`),
        JSON.stringify(points.map((p) => p.id)),
      );

      router.push(`/chantiers/${chantierId}/visites/${visite.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Choisissez une famille ou recherchez, puis cochez les points à contrôler.
        {peutCreerPoint && " Un point absent du référentiel peut être créé ici."}
      </p>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <SelecteurPoints
        peutCreer={peutCreerPoint}
        categoriesInitiales={categoriesInitiales}
        enCours={creating}
        libelleAction={(n) =>
          n === 0 ? "Cochez au moins un point" : `Démarrer la visite (${n} point${n > 1 ? "s" : ""})`
        }
        onConfirm={handleCreate}
      />
    </div>
  );
}
