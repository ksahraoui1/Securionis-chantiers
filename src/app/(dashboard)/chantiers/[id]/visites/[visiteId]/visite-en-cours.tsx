"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChecklistForm } from "@/components/visite/checklist-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { VALEURS_REPONSE } from "@/lib/utils/constants";

interface VisiteEnCoursProps {
  visiteId: string;
  chantierId: string;
  categorieIds: string[];
  existingReponses: Record<
    string,
    { id: string; valeur: string; remarque: string | null; photos: string[] }
  >;
}

interface EcartDraft {
  reponse_id: string;
  description: string;
  delai: string;
}

export function VisiteEnCours({
  visiteId,
  chantierId,
  categorieIds,
  existingReponses,
}: VisiteEnCoursProps) {
  const router = useRouter();
  const [validating, setValidating] = useState(false);
  const [showDelaiModal, setShowDelaiModal] = useState(false);
  const [nonConformeReponses, setNonConformeReponses] = useState<
    { id: string; description: string }[]
  >([]);
  const [ecartDrafts, setEcartDrafts] = useState<EcartDraft[]>([]);
  const [currentEcartIndex, setCurrentEcartIndex] = useState(0);
  const [delaiInput, setDelaiInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    setError(null);

    try {
      const supabase = createClient();

      // Fetch all reponses for this visite
      const { data: allReponses } = await supabase
        .from("reponses")
        .select("id, point_controle_id, valeur, remarque")
        .eq("visite_id", visiteId);

      if (!allReponses) {
        throw new Error("Impossible de charger les reponses");
      }

      // Filter non-conforme
      const ncReponses = allReponses.filter(
        (r) => r.valeur === VALEURS_REPONSE.NON_CONFORME
      );

      if (ncReponses.length > 0) {
        // Load point_controle intitule for description
        const pointIds = ncReponses.map((r) => r.point_controle_id);
        const { data: points } = await supabase
          .from("points_controle")
          .select("id, intitule")
          .in("id", pointIds);

        const pointMap = new Map(points?.map((p) => [p.id, p.intitule]) ?? []);

        const ncWithDesc = ncReponses.map((r) => ({
          id: r.id,
          description:
            r.remarque ||
            pointMap.get(r.point_controle_id) ||
            "Non-conformite",
        }));

        setNonConformeReponses(ncWithDesc);
        setEcartDrafts(
          ncWithDesc.map((nc) => ({
            reponse_id: nc.id,
            description: nc.description,
            delai: "",
          }))
        );
        setCurrentEcartIndex(0);
        setDelaiInput("");
        setShowDelaiModal(true);
        setValidating(false);
        return;
      }

      // No NC responses — finalize directly
      await finalizeVisite([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue"
      );
      setValidating(false);
    }
  }, [visiteId]);

  async function handleDelaiConfirm() {
    const updated = [...ecartDrafts];
    updated[currentEcartIndex] = {
      ...updated[currentEcartIndex],
      delai: delaiInput,
    };
    setEcartDrafts(updated);

    if (currentEcartIndex < ecartDrafts.length - 1) {
      setCurrentEcartIndex(currentEcartIndex + 1);
      setDelaiInput(updated[currentEcartIndex + 1]?.delai ?? "");
    } else {
      // All delais collected — finalize
      setShowDelaiModal(false);
      setValidating(true);
      await finalizeVisite(updated);
    }
  }

  async function finalizeVisite(drafts: EcartDraft[]) {
    try {
      const supabase = createClient();

      // FR-027: Create ecarts for each non-conforme
      if (drafts.length > 0) {
        const ecartsToInsert = drafts.map((d) => ({
          chantier_id: chantierId,
          reponse_id: d.reponse_id,
          description: d.description,
          delai: d.delai || null,
          statut: "ouvert" as const,
        }));

        const { error: ecartError } = await supabase
          .from("ecarts")
          .insert(ecartsToInsert);

        if (ecartError) {
          throw new Error(ecartError.message);
        }
      }

      // Update visite statut to terminee
      const { error: updateError } = await supabase
        .from("visites")
        .update({ statut: "terminee" })
        .eq("id", visiteId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      router.push(`/chantiers/${chantierId}/visites/${visiteId}/rapport`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la finalisation"
      );
      setValidating(false);
    }
  }

  const currentDraft = ecartDrafts[currentEcartIndex];

  return (
    <>
      <ChecklistForm
        visiteId={visiteId}
        chantierId={chantierId}
        categorieIds={categorieIds}
        existingReponses={existingReponses}
        onValidate={handleValidate}
        validating={validating}
      />

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <Modal
        isOpen={showDelaiModal}
        onClose={() => setShowDelaiModal(false)}
        title={`Non-conformité ${currentEcartIndex + 1} / ${ecartDrafts.length}`}
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDelaiModal(false)}
            >
              Annuler
            </Button>
            <Button onClick={handleDelaiConfirm}>
              {currentEcartIndex < ecartDrafts.length - 1
                ? "Suivant"
                : "Valider et terminer"}
            </Button>
          </div>
        }
      >
        {currentDraft && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Non-conformite :
              </p>
              <p className="text-sm text-gray-900 mt-1">
                {currentDraft.description}
              </p>
            </div>
            <div>
              <label
                htmlFor="delai"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Delai de correction
              </label>
              <input
                id="delai"
                type="text"
                value={delaiInput}
                onChange={(e) => setDelaiInput(e.target.value)}
                placeholder="Ex: 7 jours, 30.04.2026, immediat..."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px] text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
