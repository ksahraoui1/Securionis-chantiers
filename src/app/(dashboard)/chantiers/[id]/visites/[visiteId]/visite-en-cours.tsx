"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChecklistForm } from "@/components/visite/checklist-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useOfflineScope } from "@/components/ui/offline-provider";
import { preparerCloture, envoyerCloture, ErreurCloture, type DemandeCloture } from "@/lib/offline/cloture";
import { stripMarkdown } from "@/lib/utils/constants";

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
  const scope = useOfflineScope();
  const router = useRouter();
  const [validating, setValidating] = useState(false);
  const [showDelaiModal, setShowDelaiModal] = useState(false);
  const [ecartDrafts, setEcartDrafts] = useState<EcartDraft[]>([]);
  const [currentEcartIndex, setCurrentEcartIndex] = useState(0);
  const [delaiInput, setDelaiInput] = useState("");
  const [renseignementsPar, setRenseignementsPar] = useState("");
  const [remarquesGenerales, setRemarquesGenerales] = useState("");
  const [error, setError] = useState<string | null>(null);

  const empreinte = useRef<string | null>(null);
  const tentative = useRef<DemandeCloture | null>(null);
  const actionEnCours = useRef(false);
  const [confirmationIncertaine, setConfirmationIncertaine] = useState(false);

  async function handleValidate() {
    if (actionEnCours.current) return;
    actionEnCours.current = true;
    setValidating(true); setError(null);
    try {
      if (tentative.current) { await finalizeVisite([], true); return; }
      const preparation = await preparerCloture(scope, visiteId);
      empreinte.current = preparation.empreinte;
      if (preparation.non_conformites.length) {
        const drafts = preparation.non_conformites.map(nc => ({ reponse_id: nc.id, description: stripMarkdown(nc.description), delai: nc.delai ?? "" }));
        setEcartDrafts(drafts); setCurrentEcartIndex(0); setDelaiInput(drafts[0].delai);
        setShowDelaiModal(true); setValidating(false);
      } else { await finalizeVisite([]); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de préparer la validation.");
      setValidating(false);
    } finally { actionEnCours.current = false; }
  }

  async function handleDelaiConfirm() {
    if (actionEnCours.current) return;
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
      actionEnCours.current = true;
      try { await finalizeVisite(updated); } finally { actionEnCours.current = false; }
    }
  }

  async function finalizeVisite(drafts: EcartDraft[], reprise = false) {
    try {
      if (!tentative.current) {
        if (!empreinte.current) throw new ErreurCloture("Reprenez la validation.", true);
        tentative.current = {
          p_visite_id: visiteId, p_empreinte: empreinte.current, p_operation_id: crypto.randomUUID(),
          p_ecarts: drafts.map(d => ({ reponse_id: d.reponse_id, delai: d.delai.trim() || null })),
          p_renseignements_par: renseignementsPar.trim() || null,
          p_remarques_generales: remarquesGenerales.trim() || null,
        };
      }
      setConfirmationIncertaine(true);
      await envoyerCloture(scope, tentative.current, reprise);
      router.push(`/chantiers/${chantierId}/visites/${visiteId}/rapport`);
      router.refresh();
    } catch (err) {
      if (err instanceof ErreurCloture && err.refusConfirme) {
        tentative.current = null; setConfirmationIncertaine(false);
      }
      setError(err instanceof Error ? err.message : "La clôture n’a pas pu être confirmée. Réessayez la même demande.");
      setValidating(false);
    }
  }

  const currentDraft = ecartDrafts[currentEcartIndex];

  return (
    <>
      <fieldset disabled={validating || showDelaiModal || confirmationIncertaine} className="min-w-0">
      <div className="mb-6 bg-white rounded-lg border border-gray-400 p-4">
        <label
          htmlFor="renseignements_par"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Sur le chantier, renseignements donnés par
        </label>
        <input
          id="renseignements_par"
          type="text"
          value={renseignementsPar}
          onChange={(e) => setRenseignementsPar(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px] text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          placeholder="Nom de la personne"
        />
      </div>

      <div className="mb-6 bg-white rounded-lg border border-gray-400 p-4">
        <label
          htmlFor="remarques_generales"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Remarques générales
        </label>
        <textarea
          id="remarques_generales"
          value={remarquesGenerales}
          onChange={(e) => {
            setRemarquesGenerales(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onFocus={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none overflow-hidden"
          placeholder="Observations générales sur la visite, à faire figurer dans le rapport..."
        />
      </div>

      </fieldset>

      <ChecklistForm
        visiteId={visiteId}
        chantierId={chantierId}
        categorieIds={categorieIds}
        existingReponses={existingReponses}
        onValidate={handleValidate}
        validating={validating}
        editingDisabled={validating || showDelaiModal || confirmationIncertaine}
      />

      {confirmationIncertaine && !validating && <p className="mt-4 text-sm text-amber-800">La demande est conservée. Le bouton de validation réessaie la même opération sans modifier les constats.</p>}
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
                Non-conformité :
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
                Délai de correction
              </label>
              <input
                id="delai"
                type="text"
                value={delaiInput}
                onChange={(e) => setDelaiInput(e.target.value)}
                placeholder="Ex: 7 jours, 30.04.2026, immédiat..."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 min-h-[44px] text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
