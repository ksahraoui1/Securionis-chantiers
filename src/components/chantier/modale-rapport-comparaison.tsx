"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  HEX_PRIORITE,
  LIBELLES_PRIORITE,
  ORDRE_PRIORITE,
  prioriteSST,
  synthetiser,
  type EcartEvalue,
} from "@/lib/utils/priorite-sst";
import type { TypeDifference } from "@/lib/plan-diff-detection";

const NAVY = "#002855";

export type FormatRapport = "pdf" | "docx";

export interface EcartRapportClient {
  numero: number;
  type: TypeDifference;
  confiance: number;
  aireRelative: number;
  x: number;
  y: number;
  nc: number | null;
}

/**
 * Choix du format et de l'envoi, avant génération.
 *
 * Le récapitulatif affiché ici est calculé avec **les mêmes fonctions** que le
 * rapport (`priorite-sst.ts`) : ce que l'utilisateur voit avant de générer est
 * ce qu'il trouvera dans le document.
 */
export function ModaleRapportComparaison({
  ecarts,
  nbAnnotations,
  nbNonConformites,
  onGenerer,
  onFermer,
}: {
  ecarts: EcartRapportClient[];
  nbAnnotations: number;
  nbNonConformites: number;
  onGenerer: (format: FormatRapport, envoyerEmail: boolean) => Promise<void>;
  onFermer: () => void;
}) {
  const [format, setFormat] = useState<FormatRapport>("pdf");
  const [envoyerEmail, setEnvoyerEmail] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const evalues: EcartEvalue[] = ecarts.map((e) => ({
    type: e.type,
    confiance: e.confiance,
    aireRelative: e.aireRelative,
  }));
  const synthese = synthetiser(evalues);

  async function generer() {
    setErreur(null);
    setEnCours(true);
    try {
      await onGenerer(format, envoyerEmail);
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "La génération a échoué."
      );
      setEnCours(false);
      return;
    }
    setEnCours(false);
  }

  return (
    <Modal
      isOpen
      onClose={enCours ? () => undefined : onFermer}
      title="Générer le rapport de comparaison"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFermer}
            disabled={enCours}
            className="px-4 py-2 min-h-touch text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void generer()}
            disabled={enCours}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-touch text-sm text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: NAVY }}
          >
            <span translate="no" className="material-symbols-outlined text-lg">
              {enCours ? "progress_activity" : "lab_profile"}
            </span>
            {enCours ? "Génération…" : "Générer"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="block text-xs font-medium text-gray-500 mb-1">
            Contenu du rapport
          </p>
          <dl className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs space-y-1">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-44 shrink-0">Écarts détectés</dt>
              <dd className="text-gray-900 font-medium">{ecarts.length}</dd>
            </div>
            <div className="flex gap-2 items-center">
              <dt className="text-gray-500 w-44 shrink-0">Par priorité</dt>
              <dd className="flex items-center gap-2 flex-wrap">
                {ORDRE_PRIORITE.map((priorite) => (
                  <span
                    key={priorite}
                    className="inline-flex items-center gap-1 text-gray-700"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/10"
                      style={{ backgroundColor: HEX_PRIORITE[priorite] }}
                    />
                    {synthese.parPriorite[priorite]} {LIBELLES_PRIORITE[priorite]}
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-44 shrink-0">
                Taux de confiance moyen
              </dt>
              <dd className="text-gray-900">
                {Math.round(synthese.confianceMoyenne * 100)} %
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-44 shrink-0">
                Annotations manuelles
              </dt>
              <dd className="text-gray-900">{nbAnnotations}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-44 shrink-0">
                Non-conformités créées
              </dt>
              <dd className="text-gray-900">{nbNonConformites}</dd>
            </div>
          </dl>
        </div>

        <fieldset>
          <legend className="block text-xs font-medium text-gray-500 mb-1">
            Format
          </legend>
          <div className="flex gap-2">
            {(
              [
                { valeur: "pdf" as const, libelle: "PDF", icone: "picture_as_pdf" },
                { valeur: "docx" as const, libelle: "Word (DOCX)", icone: "description" },
              ]
            ).map((choix) => (
              <label
                key={choix.valeur}
                className={`flex-1 inline-flex items-center gap-2 px-3 py-2 min-h-touch rounded-lg border cursor-pointer text-sm transition-colors ${
                  format === choix.valeur
                    ? "border-transparent text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                }`}
                style={
                  format === choix.valeur ? { backgroundColor: NAVY } : undefined
                }
              >
                <input
                  type="radio"
                  name="format-rapport"
                  checked={format === choix.valeur}
                  onChange={() => setFormat(choix.valeur)}
                  className="sr-only"
                />
                <span translate="no" className="material-symbols-outlined text-lg">
                  {choix.icone}
                </span>
                {choix.libelle}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={envoyerEmail}
            onChange={(e) => setEnvoyerEmail(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Envoyer le rapport aux destinataires du chantier
            <span className="block text-[11px] text-gray-500">
              Ceux enregistrés dans la section Destinataires. Sans destinataire,
              le rapport est généré sans être envoyé.
            </span>
          </span>
        </label>

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Les priorités et recommandations du rapport sont établies par une règle
          déterministe fondée sur la confiance de détection, la surface et le sens
          de l&apos;écart. Ce n&apos;est pas une analyse de sécurité : le rapport
          le dit explicitement en page de garde.
        </p>

        <p className="text-[11px] text-gray-500">
          Le rapport est classé dans les documents du chantier après génération.
        </p>

        {erreur && (
          <p className="text-sm text-red-600 flex items-start gap-1">
            <span translate="no" className="material-symbols-outlined text-sm">
              error
            </span>
            {erreur}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Priorité d'un écart, pour l'affichage côté client. */
export { prioriteSST };
