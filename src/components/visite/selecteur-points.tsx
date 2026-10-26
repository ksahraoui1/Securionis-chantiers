"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FAMILLES, COULEUR_FAMILLE, type Famille } from "@/lib/utils/familles";
import {
  compterParFamille,
  filtrerPoints,
  grouperParCategorie,
  type FiltrePoints,
  type PointSelectionnable,
} from "@/lib/visites/selection-points";
import { CreerPointForm, SELECT_POINT_SELECTIONNABLE } from "./creer-point-form";

interface SelecteurPointsProps {
  /** Rôle autorisé à créer un point (administrateur ou inspecteur). */
  peutCreer: boolean;
  /** Points déjà dans la visite : affichés cochés, non resélectionnables. */
  dejaPresents?: string[];
  /** Catégories de la dernière visite, proposées comme premier filtre. */
  categoriesInitiales?: string[];
  libelleAction: (nombre: number) => string;
  enCours?: boolean;
  onConfirm: (points: PointSelectionnable[]) => void;
  onCancel?: () => void;
}

const AUCUN: string[] = [];

type Pastille = { cle: string; libelle: string; nombre: number; filtre: FiltrePoints; famille?: Famille };

function memeFiltre(a: FiltrePoints | null, b: FiltrePoints): boolean {
  if (!a || a.type !== b.type) return false;
  if (a.type === "famille" && b.type === "famille") return a.famille === b.famille;
  return true;
}

export function SelecteurPoints({
  peutCreer,
  dejaPresents = AUCUN,
  categoriesInitiales = AUCUN,
  libelleAction,
  enCours = false,
  onConfirm,
  onCancel,
}: SelecteurPointsProps) {
  const [points, setPoints] = useState<PointSelectionnable[]>([]);
  const [categories, setCategories] = useState<{ id: string; libelle: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<FiltrePoints | null>(
    categoriesInitiales.length > 0 ? { type: "categories", ids: categoriesInitiales } : null,
  );
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [creation, setCreation] = useState(false);

  const presents = useMemo(() => new Set(dejaPresents), [dejaPresents]);

  useEffect(() => {
    let annule = false;
    async function load() {
      const supabase = createClient();
      const [pts, cats] = await Promise.all([
        supabase.from("points_controle").select(SELECT_POINT_SELECTIONNABLE).eq("actif", true),
        supabase.from("categories").select("id, libelle").eq("actif", true),
      ]);
      if (annule) return;
      if (pts.error || cats.error) {
        setLoadError(true);
      } else {
        setPoints((pts.data ?? []) as unknown as PointSelectionnable[]);
        setCategories(cats.data ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      annule = true;
    };
  }, []);

  const pastilles = useMemo<Pastille[]>(() => {
    const parFamille = compterParFamille(points);
    const liste: Pastille[] = [];
    if (categoriesInitiales.length > 0) {
      liste.push({
        cle: "derniere",
        libelle: "Dernière visite",
        nombre: points.filter((p) => categoriesInitiales.includes(p.categorie_id ?? "")).length,
        filtre: { type: "categories", ids: categoriesInitiales },
      });
    }
    for (const f of FAMILLES) {
      const n = parFamille.get(f) ?? 0;
      if (n > 0) liste.push({ cle: f, libelle: f, nombre: n, filtre: { type: "famille", famille: f }, famille: f });
    }
    return liste;
  }, [points, categoriesInitiales]);

  const rechercheActive = recherche.trim().length > 0;
  // La recherche porte sur tout le référentiel : sur le terrain on ne sait pas
  // toujours dans quelle famille un point a été rangé.
  const filtreEffectif = useMemo<FiltrePoints | null>(
    () => (rechercheActive ? { type: "tous" } : filtre),
    [rechercheActive, filtre],
  );

  const groupes = useMemo(
    () => (filtreEffectif ? grouperParCategorie(filtrerPoints(points, filtreEffectif, recherche)) : []),
    [points, filtreEffectif, recherche],
  );
  const nbAffiches = groupes.reduce((n, g) => n + g.points.length, 0);

  const selectionParFamille = useMemo(() => {
    const choisis = points.filter((p) => selection.has(p.id));
    return compterParFamille(choisis);
  }, [points, selection]);

  function basculer(id: string) {
    if (presents.has(id)) return;
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function basculerGroupe(ids: string[]) {
    const libres = ids.filter((id) => !presents.has(id));
    setSelection((prev) => {
      const next = new Set(prev);
      const tousCoches = libres.every((id) => next.has(id));
      for (const id of libres) {
        if (tousCoches) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function choisirPastille(p: Pastille) {
    setRecherche("");
    setFiltre(memeFiltre(filtre, p.filtre) ? null : p.filtre);
  }

  function handleCree(point: PointSelectionnable) {
    setPoints((prev) => [...prev.filter((p) => p.id !== point.id), point]);
    setSelection((prev) => new Set(prev).add(point.id));
    setCreation(false);
    setRecherche("");
    if (point.famille && FAMILLES.includes(point.famille as Famille)) {
      setFiltre({ type: "famille", famille: point.famille as Famille });
    }
  }

  function handleExistant(point: PointSelectionnable) {
    if (!presents.has(point.id)) setSelection((prev) => new Set(prev).add(point.id));
    setCreation(false);
    setRecherche(point.intitule);
  }

  // Catégorie proposée par défaut : celle du filtre ou du seul groupe affiché.
  const categorieParDefaut =
    filtre?.type === "categories" && filtre.ids.length === 1
      ? filtre.ids[0]
      : groupes.length === 1 && groupes[0].categorieId !== "sans-categorie"
        ? groupes[0].categorieId
        : null;

  if (loading) {
    return <p className="text-gray-500 text-center py-8">Chargement des points de contrôle…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        Impossible de charger les points de contrôle. Vérifiez la connexion puis rechargez la page.
      </p>
    );
  }

  const nbSelection = selection.size;

  return (
    <div className="space-y-4">
      <div className="relative">
        <span translate="no" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un point (ex : garde-corps, échelle, fouille)…"
          className="w-full rounded-lg border border-gray-300 pl-10 pr-12 py-3 text-base min-h-[44px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        {recherche && (
          <button
            type="button"
            onClick={() => setRecherche("")}
            aria-label="Effacer la recherche"
            className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <span translate="no" className="material-symbols-outlined text-lg">close</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {pastilles.map((p) => {
          const actif = !rechercheActive && memeFiltre(filtre, p.filtre);
          const coches = p.famille ? selectionParFamille.get(p.famille) ?? 0 : 0;
          return (
            <button
              key={p.cle}
              type="button"
              onClick={() => choisirPastille(p)}
              aria-pressed={actif}
              className={`min-h-[44px] px-3 rounded-full border text-sm font-medium flex items-center gap-1.5 transition-colors ${
                actif
                  ? "bg-blue-600 border-blue-600 text-white"
                  : p.famille
                    ? `${COULEUR_FAMILLE[p.famille]} border-transparent hover:border-blue-300`
                    : "bg-white border-gray-300 text-gray-700 hover:border-blue-300"
              }`}
            >
              {p.libelle}
              <span className={`text-xs ${actif ? "text-blue-100" : "opacity-70"}`}>{p.nombre}</span>
              {coches > 0 && (
                <span className={`text-xs rounded-full px-1.5 ${actif ? "bg-white text-blue-700" : "bg-blue-600 text-white"}`}>
                  ✓ {coches}
                </span>
              )}
            </button>
          );
        })}
        {nbSelection > 0 && (
          <button
            type="button"
            onClick={() => {
              setRecherche("");
              setFiltre(filtre?.type === "selection" ? null : { type: "selection", ids: selection });
            }}
            aria-pressed={!rechercheActive && filtre?.type === "selection"}
            className={`min-h-[44px] px-3 rounded-full border text-sm font-medium ${
              !rechercheActive && filtre?.type === "selection"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-blue-600 text-blue-700"
            }`}
          >
            Ma sélection ({nbSelection})
          </button>
        )}
      </div>

      {!filtreEffectif ? (
        <p className="text-sm text-gray-500 text-center py-6">
          Choisissez une famille ou recherchez un point.
        </p>
      ) : nbAffiches === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          {rechercheActive ? <>Aucun point pour «&nbsp;{recherche.trim()}&nbsp;».</> : "Aucun point."}
        </p>
      ) : (
        <div className="space-y-4">
          {rechercheActive && (
            <p className="text-xs text-gray-500">{nbAffiches} point{nbAffiches > 1 ? "s" : ""} trouvé{nbAffiches > 1 ? "s" : ""}</p>
          )}
          {groupes.map((g) => {
            const ids = g.points.map((p) => p.id);
            const libres = ids.filter((id) => !presents.has(id));
            const coches = libres.filter((id) => selection.has(id)).length;
            const tous = libres.length > 0 && coches === libres.length;
            return (
              <section key={g.categorieId} className="bg-white rounded-lg border border-gray-200">
                <header className="flex items-center justify-between gap-2 px-3 py-1 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {g.libelle}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {coches > 0 ? `${coches} / ${libres.length}` : g.points.length}
                    </span>
                  </h3>
                  {libres.length > 1 && (
                    <button
                      type="button"
                      onClick={() => basculerGroupe(ids)}
                      className="min-h-[44px] px-2 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                    >
                      {tous ? "Tout décocher" : "Tout cocher"}
                    </button>
                  )}
                </header>
                <ul className="divide-y divide-gray-100">
                  {g.points.map((p) => {
                    const present = presents.has(p.id);
                    const coche = present || selection.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => basculer(p.id)}
                          disabled={present}
                          aria-pressed={coche}
                          className="w-full min-h-[44px] flex items-start gap-3 px-3 py-2.5 text-left hover:bg-blue-50/50 disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <span
                            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                              present ? "bg-gray-300 border-gray-300" : coche ? "bg-blue-600 border-blue-600" : "border-gray-300"
                            }`}
                          >
                            {coche && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm ${present ? "text-gray-400" : "text-gray-900"}`}>{p.intitule}</span>
                            <span className="flex flex-wrap gap-x-2 text-xs text-gray-400">
                              {p.base_legale && <span>{p.base_legale}</span>}
                              {p.is_custom && <span className="text-amber-700">Ajout terrain</span>}
                              {present && <span>Déjà dans la visite</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {peutCreer &&
        (creation ? (
          <CreerPointForm
            categories={categories}
            points={points}
            intituleInitial={recherche.trim()}
            categorieInitiale={categorieParDefaut}
            onCreated={handleCree}
            onChoisirExistant={handleExistant}
            onCancel={() => setCreation(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="w-full min-h-[44px] py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-700 flex items-center justify-center gap-2"
          >
            <span translate="no" className="material-symbols-outlined text-lg">add_circle</span>
            {rechercheActive && nbAffiches === 0
              ? `Créer le point « ${recherche.trim()} »`
              : "Créer un point qui n'existe pas encore"}
          </button>
        ))}

      <div className="sticky bottom-0 bg-gray-50 pt-3 pb-6 flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 min-h-[44px] text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
        )}
        <button
          type="button"
          onClick={() => onConfirm(points.filter((p) => selection.has(p.id)))}
          disabled={nbSelection === 0 || enCours}
          className="flex-1 py-3 min-h-[44px] bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 text-base"
        >
          {enCours ? "Un instant…" : libelleAction(nbSelection)}
        </button>
      </div>
    </div>
  );
}
