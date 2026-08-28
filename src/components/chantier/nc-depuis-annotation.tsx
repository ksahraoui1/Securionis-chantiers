"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type {
  Annotation,
  CouleurAnnotation,
} from "@/components/chantier/comparaison-annotations";
import type { PlanDoc } from "@/components/chantier/comparaison-plans";

const NAVY = "#002855";

export type Priorite = "haute" | "moyenne" | "basse";

// Rouge = critique, orange = moyen, vert = résolu, jaune = info.
const PRIORITE_PAR_COULEUR: Record<CouleurAnnotation, Priorite> = {
  red: "haute",
  orange: "moyenne",
  green: "basse",
  yellow: "basse",
};

const PRIORITES: { valeur: Priorite; libelle: string }[] = [
  { valeur: "haute", libelle: "Haute" },
  { valeur: "moyenne", libelle: "Moyenne" },
  { valeur: "basse", libelle: "Basse" },
];

export interface Capture {
  blob: Blob | null;
  apercu: string | null;
}

export interface NCCreee {
  ncId: string;
  numero: number;
  /** Renseigné si la NC a bien été créée mais qu'un à-côté a échoué. */
  avertissement?: string;
}

export function ModaleCreationNC({
  annotation,
  chantierId,
  chantierNom,
  docPE,
  docEXE,
  pagePE,
  pageEXE,
  capture,
  onFermer,
  onCree,
}: {
  annotation: Annotation;
  chantierId: string;
  chantierNom: string;
  docPE: PlanDoc;
  docEXE: PlanDoc;
  pagePE: number;
  pageEXE: number;
  capture: Capture;
  onFermer: () => void;
  onCree: (nc: NCCreee) => void;
}) {
  const [titre, setTitre] = useState(
    `Écart entre PE et EXE — ${docEXE.nom}`
  );
  const [description, setDescription] = useState(annotation.commentaire ?? "");
  const [priorite, setPriorite] = useState<Priorite>(
    PRIORITE_PAR_COULEUR[annotation.color]
  );
  const [delai, setDelai] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer() {
    if (!titre.trim() || !description.trim()) {
      setErreur("Le titre et la description sont obligatoires.");
      return;
    }

    setEnvoi(true);
    setErreur(null);
    const supabase = createClient();

    // 1. Capture de la zone annotée, si elle a pu être produite.
    //    Bucket `visite-photos` : c'est le seul qui accepte les PNG, `rapports`
    //    étant restreint à application/pdf. Le chantier en première composante
    //    du chemin, pour rester dans le périmètre de la policy de suppression.
    let captureUrl: string | null = null;
    let avertissement: string | undefined;
    if (capture.blob) {
      const chemin = `${chantierId}/comparaisons/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from("visite-photos")
        .upload(chemin, capture.blob, {
          contentType: "image/png",
          upsert: false,
        });
      if (error) {
        avertissement =
          "La capture n'a pas pu être enregistrée : " + error.message;
      } else {
        captureUrl = supabase.storage
          .from("visite-photos")
          .getPublicUrl(chemin).data.publicUrl;
      }
    }

    // 2. La non-conformité elle-même
    const { data: nc, error: erreurNC } = await supabase
      .from("ecarts")
      .insert({
        chantier_id: chantierId,
        reponse_id: null,
        titre: titre.trim(),
        description: description.trim(),
        type: "ecart_plan",
        priorite,
        delai: delai.trim() || null,
        statut: "ouvert",
      })
      .select("id, numero")
      .single();

    if (erreurNC || !nc) {
      setErreur(
        "La non-conformité n'a pas pu être créée : " +
          (erreurNC?.message ?? "réponse vide")
      );
      setEnvoi(false);
      return;
    }

    // 3. Le lien avec l'annotation. En cas d'échec, la NC serait orpheline :
    //    on la retire plutôt que de laisser un état à moitié créé.
    const { error: erreurLien } = await supabase
      .from("comparaison_nc_links")
      .insert({
        annotation_id: annotation.id,
        nc_id: nc.id,
        capture_url: captureUrl,
      });

    if (erreurLien) {
      await supabase.from("ecarts").delete().eq("id", nc.id);
      setErreur(
        "Le lien avec l'annotation n'a pas pu être enregistré : " +
          erreurLien.message
      );
      setEnvoi(false);
      return;
    }

    onCree({ ncId: nc.id, numero: nc.numero, avertissement });
  }

  return (
    <Modal
      isOpen
      onClose={envoi ? () => undefined : onFermer}
      title="Créer une non-conformité"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFermer}
            disabled={envoi}
            className="px-4 py-2 min-h-touch text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={creer}
            disabled={envoi}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-touch text-sm text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: NAVY }}
          >
            <span translate="no" className="material-symbols-outlined text-lg">report</span>
            {envoi ? "Création…" : "Créer la NC"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="nc-titre" className="block text-xs font-medium text-gray-500 mb-1">
            Titre *
          </label>
          <input
            id="nc-titre"
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
          />
        </div>

        <div>
          <label htmlFor="nc-description" className="block text-xs font-medium text-gray-500 mb-1">
            Description *
          </label>
          <textarea
            id="nc-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Décrivez l'écart constaté entre les deux plans"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Écart de plan
            </p>
          </div>
          <div>
            <label htmlFor="nc-priorite" className="block text-xs font-medium text-gray-500 mb-1">
              Priorité
            </label>
            <select
              id="nc-priorite"
              value={priorite}
              onChange={(e) => setPriorite(e.target.value as Priorite)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
            >
              {PRIORITES.map((p) => (
                <option key={p.valeur} value={p.valeur}>
                  {p.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="nc-delai" className="block text-xs font-medium text-gray-500 mb-1">
            Délai (optionnel)
          </label>
          <input
            id="nc-delai"
            type="text"
            value={delai}
            onChange={(e) => setDelai(e.target.value)}
            placeholder="Ex : sous 15 jours"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
          />
        </div>

        <dl className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs space-y-1">
          <div className="flex gap-2">
            <dt className="text-gray-500 w-20 shrink-0">Chantier</dt>
            <dd className="text-gray-900 font-medium">{chantierNom}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-20 shrink-0">Plan PE</dt>
            <dd className="text-gray-900">
              {docPE.nom}
              {docPE.plan_version ? ` — V${docPE.plan_version}` : ""} — page {pagePE}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-20 shrink-0">Plan EXE</dt>
            <dd className="text-gray-900">
              {docEXE.nom}
              {docEXE.plan_version ? ` — V${docEXE.plan_version}` : ""} — page {pageEXE}
            </dd>
          </div>
        </dl>

        <div>
          <p className="block text-xs font-medium text-gray-500 mb-1">
            Capture de la zone annotée
          </p>
          {capture.apercu ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={capture.apercu}
              alt="Capture de la zone annotée"
              className="w-full rounded-lg border border-gray-300"
            />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              La capture n&apos;a pas pu être produite. La non-conformité sera
              créée sans image.
            </p>
          )}
        </div>

        {erreur && (
          <p className="text-sm text-red-600 flex items-start gap-1">
            <span translate="no" className="material-symbols-outlined text-sm">error</span>
            {erreur}
          </p>
        )}
      </div>
    </Modal>
  );
}
