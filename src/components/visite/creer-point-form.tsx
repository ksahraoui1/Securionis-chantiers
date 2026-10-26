"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { genererMotsCles } from "@/lib/utils/mots-cles";
import { FAMILLES, familleDeCategorie } from "@/lib/utils/familles";
import { normaliser, type PointSelectionnable } from "@/lib/visites/selection-points";

export const SELECT_POINT_SELECTIONNABLE =
  "id, intitule, famille, categorie_id, theme_id, base_legale, mots_cles, is_custom, categories(libelle), themes(libelle)";

interface CreerPointFormProps {
  categories: { id: string; libelle: string }[];
  points: PointSelectionnable[];
  intituleInitial: string;
  categorieInitiale: string | null;
  onCreated: (point: PointSelectionnable) => void;
  onChoisirExistant: (point: PointSelectionnable) => void;
  onCancel: () => void;
}

/** Points existants dont l'intitulé partage au moins deux mots significatifs. */
function pointsProches(points: PointSelectionnable[], intitule: string): PointSelectionnable[] {
  const mots = [...new Set(normaliser(intitule).split(/[^\p{L}\p{N}]+/u).filter((m) => m.length >= 4))];
  if (mots.length === 0) return [];
  const seuil = Math.min(2, mots.length);
  return points
    .map((p) => {
      const texte = normaliser(p.intitule);
      return { p, score: mots.filter((m) => texte.includes(m)).length };
    })
    .filter((x) => x.score >= seuil)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.p);
}

function messageErreur(code: string | undefined, message: string | undefined): string {
  if (code === "42501") return "Vous n'avez pas le droit de créer un point de contrôle.";
  if (code === "22023") return "L'intitulé doit compter entre 5 et 500 caractères.";
  if (code === "53400") return "Limite de 50 points créés par jour atteinte.";
  if (code === "40001") return "Ce point a changé entre-temps. Relancez la création.";
  return message ? `Création impossible : ${message}` : "Création impossible.";
}

export function CreerPointForm({
  categories,
  points,
  intituleInitial,
  categorieInitiale,
  onCreated,
  onChoisirExistant,
  onCancel,
}: CreerPointFormProps) {
  const [intitule, setIntitule] = useState(intituleInitial);
  const [categorieId, setCategorieId] = useState(categorieInitiale ?? "");
  const [baseLegale, setBaseLegale] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Identifiant du point, conservé tant que le contenu ne change pas : après une
  // réponse incertaine, réessayer rejoue la même création au lieu d'en faire
  // une seconde (cf. migration 068).
  const operation = useRef<{ id: string; cle: string } | null>(null);

  const proches = useMemo(() => pointsProches(points, intitule), [points, intitule]);

  const categoriesParFamille = useMemo(
    () =>
      FAMILLES.map((f) => ({
        famille: f,
        categories: categories
          .filter((c) => familleDeCategorie(c.libelle) === f)
          .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
      })).filter((g) => g.categories.length > 0),
    [categories],
  );

  const intituleValide = intitule.trim().length >= 5;

  async function handleCreer() {
    if (!intituleValide || !categorieId || saving) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("La création d'un point demande le réseau. Réessayez une fois reconnecté.");
      return;
    }
    setSaving(true);
    setError(null);

    const texte = intitule.trim().replace(/\s+/g, " ");
    const base = baseLegale.trim();
    const cle = `${categorieId}\n${texte}\n${base}`;
    if (!operation.current || operation.current.cle !== cle) {
      operation.current = { id: crypto.randomUUID(), cle };
    }
    const categorie = categories.find((c) => c.id === categorieId);

    try {
      const supabase = createClient();
      const { data: id, error: rpcError } = await supabase.rpc("creer_point_controle_terrain", {
        p_id: operation.current.id,
        p_categorie_id: categorieId,
        p_intitule: texte,
        p_base_legale: base || null,
        p_mots_cles: genererMotsCles(texte, categorie?.libelle),
      });
      if (rpcError) {
        setError(messageErreur(rpcError.code, rpcError.message));
        return;
      }
      const { data: point, error: lectureError } = await supabase
        .from("points_controle")
        .select(SELECT_POINT_SELECTIONNABLE)
        .eq("id", id as string)
        .single();
      if (lectureError || !point) {
        setError("Le point est créé mais n'a pas pu être relu. Réessayez : il ne sera pas créé deux fois.");
        return;
      }
      operation.current = null;
      onCreated(point as unknown as PointSelectionnable);
    } catch {
      setError("Réponse du serveur incertaine. Réessayez : le point ne sera pas créé deux fois.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-900">Nouveau point de contrôle</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fermer"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700"
        >
          <span translate="no" className="material-symbols-outlined">close</span>
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">Intitulé</span>
        <textarea
          value={intitule}
          onChange={(e) => setIntitule(e.target.value)}
          rows={2}
          autoFocus
          maxLength={500}
          placeholder="Ex : Vérifier la fixation des garde-corps provisoires"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
      </label>

      {proches.length > 0 && (
        <div className="rounded-lg bg-white border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">Points proches déjà existants :</p>
          <ul className="space-y-1">
            {proches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChoisirExistant(p)}
                  className="w-full min-h-[44px] text-left text-sm px-2 py-2 rounded hover:bg-amber-50 flex items-center gap-2"
                >
                  <span translate="no" className="material-symbols-outlined text-base text-amber-700">add_task</span>
                  <span className="flex-1">{p.intitule}</span>
                  <span className="text-xs text-gray-400 shrink-0">{p.categories?.libelle}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-gray-700">Catégorie</span>
        <select
          value={categorieId}
          onChange={(e) => setCategorieId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base min-h-[44px] bg-white"
        >
          <option value="">Choisir une catégorie…</option>
          {categoriesParFamille.map((g) => (
            <optgroup key={g.famille} label={g.famille}>
              {g.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.libelle}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">Base légale <span className="font-normal text-gray-400">(facultatif)</span></span>
        <input
          type="text"
          value={baseLegale}
          onChange={(e) => setBaseLegale(e.target.value)}
          maxLength={300}
          placeholder="Ex : OTConst, Suva 44077"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base min-h-[44px]"
        />
      </label>

      <p className="text-xs text-gray-500">
        Le point rejoint le référentiel de l&apos;entreprise et sera proposé aux visites suivantes.
      </p>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 min-h-[44px] text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleCreer}
          disabled={!intituleValide || !categorieId || saving}
          className="px-4 min-h-[44px] text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Création…" : "Créer et cocher"}
        </button>
      </div>
    </div>
  );
}
