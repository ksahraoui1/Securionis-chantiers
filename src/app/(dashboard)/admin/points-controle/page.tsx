"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PointControleForm } from "@/components/admin/point-controle-form";
import { ImportExcelPoints } from "@/components/admin/import-excel-points";
import { Modal } from "@/components/ui/modal";
import {
  FAMILLES,
  COULEUR_FAMILLE,
  familleDeCategorie,
  type Famille,
} from "@/lib/utils/familles";
import type { Tables } from "@/types/database";
import { construireTsQuery } from "@/lib/utils/recherche";

type PointWithRelations = Tables<"points_controle"> & {
  categories: { libelle: string } | null;
  themes: { libelle: string } | null;
};

/** Colonnes explicites : évite de rapatrier la colonne générée `search_vector`. */
const POINT_COLUMNS =
  "id, phase_id, categorie_id, theme_id, intitule, critere, base_legale, objet, " +
  "explications, famille, mots_cles, is_custom, actif, created_by, created_at, " +
  "updated_at, categories(libelle), themes(libelle)";

export default function AdminPointsControlePage() {
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [themes, setThemes] = useState<Tables<"themes">[]>([]);
  const [points, setPoints] = useState<PointWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterFamille, setFilterFamille] = useState<Famille | "">("");
  const [filterCat, setFilterCat] = useState("");
  const [filterTheme, setFilterTheme] = useState("");
  const [filterActif, setFilterActif] = useState<"all" | "actif" | "inactif">("actif");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingPoint, setEditingPoint] = useState<Tables<"points_controle"> | null>(null);

  // Création catégorie / thème inline
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [savingCat, setSavingCat] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [showNewTheme, setShowNewTheme] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  // Recherche instantanée : on laisse retomber la frappe avant d'interroger Supabase
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("categories").select("*").order("libelle");
      if (data) setCategories(data);
    }
    load();
  }, []);

  // Catégories du second niveau : uniquement celles de la famille choisie
  const categoriesDeLaFamille = useMemo(() => {
    if (!filterFamille) return [];
    return categories.filter((c) => familleDeCategorie(c.libelle) === filterFamille);
  }, [categories, filterFamille]);

  // Changer de catégorie invalide le thème sélectionné.
  //
  // Ces deux remises à zéro vivaient dans l'effet de chargement des thèmes, ce
  // qui provoquait un rendu en cascade à chaque changement : l'effet
  // s'exécutait *après* le rendu, puis reposait deux états, donc un rendu de
  // plus. Elles appartiennent à l'événement qui change la catégorie, pas à la
  // synchronisation qui en découle.
  function handleChangeCategorie(categorieId: string) {
    setFilterCat(categorieId);
    setFilterTheme("");
    setShowNewTheme(false);
  }

  // Changer de famille invalide la catégorie (et par ricochet le thème) sélectionnée
  function handleChangeFamille(famille: Famille | "") {
    setFilterFamille(famille);
    handleChangeCategorie("");
    setShowNewCat(false);
  }

  // Load themes filtered by category — inutile de charger les 442 thèmes
  // tant qu'aucune catégorie n'est sélectionnée (le select reste désactivé).
  useEffect(() => {
    async function load() {
      if (!filterCat) {
        setThemes([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("themes")
        .select("*")
        .eq("categorie_id", filterCat)
        .order("libelle");
      if (data) setThemes(data);
    }
    load();
  }, [filterCat]);

  // Load points
  // Numéro de la requête en cours. La recherche est débouncée à 250 ms : sans
  // ce compteur, une réponse lente partie sur « écha » peut revenir *après*
  // celle de « échafaudage » et réafficher les résultats de la frappe
  // précédente. Le lint ne voit pas ce défaut-là ; il est pourtant réel.
  const requeteRef = useRef(0);

  const loadPoints = useCallback(async () => {
    const requete = ++requeteRef.current;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("points_controle")
      .select(POINT_COLUMNS)
      .not("theme_id", "is", null)
      .order("intitule");

    if (filterFamille) query = query.eq("famille", filterFamille);
    if (filterCat) query = query.eq("categorie_id", filterCat);
    if (filterTheme) query = query.eq("theme_id", filterTheme);
    if (filterActif === "actif") query = query.eq("actif", true);
    if (filterActif === "inactif") query = query.eq("actif", false);

    const tsQuery = construireTsQuery(debouncedSearch);
    if (tsQuery) {
      query = query.textSearch("search_vector", tsQuery, { config: "french_unaccent" });
    }

    const { data } = await query;
    if (requete !== requeteRef.current) return; // une requête plus récente a pris la main
    if (data) setPoints(data as unknown as PointWithRelations[]);
    setLoading(false);
  }, [filterFamille, filterCat, filterTheme, filterActif, debouncedSearch]);

  // Chargement au montage et au changement de filtre : le seul usage d'effet
  // que React sanctionne pour cela, et `setLoading(true)` y est synchrone par
  // nature. Les réponses obsolètes sont écartées par `requeteRef` ci-dessus.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPoints();
  }, [loadPoints]);

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("categories")
      .insert({ libelle: newCatName.trim(), phase_id: null, is_custom: true, actif: true })
      .select("*")
      .single();
    if (data) {
      setCategories((prev) => [...prev, data].sort((a, b) => a.libelle.localeCompare(b.libelle)));
      // La nouvelle catégorie appartient à la famille déduite de son libellé
      setFilterFamille(familleDeCategorie(data.libelle));
      handleChangeCategorie(data.id);
      setNewCatName("");
      setShowNewCat(false);
    }
    setSavingCat(false);
  }

  async function handleCreateTheme() {
    if (!newThemeName.trim() || !filterCat) return;
    setSavingTheme(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("themes")
      .insert({ categorie_id: filterCat, libelle: newThemeName.trim() })
      .select("*")
      .single();
    if (data) {
      setThemes((prev) => [...prev, data].sort((a, b) => a.libelle.localeCompare(b.libelle)));
      setFilterTheme(data.id);
      setNewThemeName("");
      setShowNewTheme(false);
    }
    setSavingTheme(false);
  }

  async function handleToggleActif(id: string, actif: boolean) {
    const supabase = createClient();
    await supabase
      .from("points_controle")
      .update({ actif: !actif, updated_at: new Date().toISOString() })
      .eq("id", id);
    loadPoints();
  }

  const activeCount = points.filter((p) => p.actif).length;
  const inactiveCount = points.filter((p) => !p.actif).length;
  const hasFilters = Boolean(filterFamille || filterCat || filterTheme || debouncedSearch);
  const isSearching = search.trim() !== debouncedSearch;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Points de contrôle</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} actifs · {inactiveCount} désactivés · {FAMILLES.length} familles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExcelPoints onImported={loadPoints} />
          <button
            onClick={() => {
              setEditingPoint(null);
              setShowForm(true);
            }}
            className="px-4 py-3 min-h-touch bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm"
          >
            + Nouveau point
          </button>
        </div>
      </div>

      {/* Recherche + filtres */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un point de contrôle (intitulé, base légale, mots-clés...)"
            className="w-full rounded-lg border border-gray-300 pl-10 pr-10 py-2 text-sm min-h-touch focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Famille</label>
            <select
              value={filterFamille}
              onChange={(e) => handleChangeFamille(e.target.value as Famille | "")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            >
              <option value="">Toutes les familles</option>
              {FAMILLES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Catégorie</label>
              {filterFamille && (
                <button
                  type="button"
                  onClick={() => setShowNewCat(!showNewCat)}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {showNewCat ? "Annuler" : "+ Nouvelle"}
                </button>
              )}
            </div>
            {showNewCat && filterFamille ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateCategory(); } }}
                  placeholder="Nom de la catégorie"
                  autoFocus
                  className="flex-1 rounded-lg border border-blue-300 px-3 py-2 text-sm min-h-touch bg-blue-50"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={!newCatName.trim() || savingCat}
                  className="px-3 py-2 min-h-touch bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCat ? "..." : "Créer"}
                </button>
              </div>
            ) : (
              <select
                value={filterCat}
                onChange={(e) => handleChangeCategorie(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch disabled:bg-gray-50 disabled:text-gray-400"
                disabled={!filterFamille}
              >
                <option value="">
                  {filterFamille ? "Toutes les catégories" : "Choisir une famille d'abord"}
                </option>
                {categoriesDeLaFamille.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Thème</label>
              {filterCat && (
                <button
                  type="button"
                  onClick={() => setShowNewTheme(!showNewTheme)}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {showNewTheme ? "Annuler" : "+ Nouveau"}
                </button>
              )}
            </div>
            {showNewTheme && filterCat ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateTheme(); } }}
                  placeholder="Nom du thème"
                  autoFocus
                  className="flex-1 rounded-lg border border-blue-300 px-3 py-2 text-sm min-h-touch bg-blue-50"
                />
                <button
                  type="button"
                  onClick={handleCreateTheme}
                  disabled={!newThemeName.trim() || savingTheme}
                  className="px-3 py-2 min-h-touch bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingTheme ? "..." : "Créer"}
                </button>
              </div>
            ) : (
              <select
                value={filterTheme}
                onChange={(e) => setFilterTheme(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch disabled:bg-gray-50 disabled:text-gray-400"
                disabled={!filterCat}
              >
                <option value="">
                  {filterCat ? "Tous les thèmes" : "Choisir une catégorie d'abord"}
                </option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select
              value={filterActif}
              onChange={(e) => setFilterActif(e.target.value as typeof filterActif)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
            >
              <option value="actif">Actifs uniquement</option>
              <option value="inactif">Désactivés uniquement</option>
              <option value="all">Tous</option>
            </select>
          </div>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              handleChangeFamille("");
              setFilterTheme("");
              setSearch("");
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* Liste */}
      {loading && points.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">Chargement...</p>
      ) : points.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Aucun point de contrôle trouvé.</p>
          {debouncedSearch && (
            <p className="text-xs text-gray-400 mt-1">
              Aucun résultat pour « {debouncedSearch} ».
            </p>
          )}
        </div>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <p className="text-xs text-gray-400 px-1">{points.length} résultats</p>
          {points.map((point) => (
            <div
              key={point.id}
              className={`bg-white rounded-lg border p-4 hover:bg-gray-50 transition-colors ${
                !point.actif ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => {
                    setEditingPoint(point);
                    setShowForm(true);
                  }}
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {point.famille && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          COULEUR_FAMILLE[point.famille as Famille] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {point.famille}
                      </span>
                    )}
                    {point.categories && point.categories.libelle !== point.famille && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                        {point.categories.libelle}
                      </span>
                    )}
                    {point.themes && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {point.themes.libelle}
                      </span>
                    )}
                    {point.is_custom && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        Personnalisé
                      </span>
                    )}
                    {!point.actif && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                        Désactivé
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm">{point.intitule}</p>
                  {point.base_legale && (
                    <p className="text-xs text-gray-500 mt-0.5">{point.base_legale}</p>
                  )}
                  {point.explications && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{point.explications}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleActif(point.id, point.actif)}
                  className={`shrink-0 px-3 py-2 min-h-touch text-xs font-medium rounded-lg transition-colors ${
                    point.actif
                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                      : "bg-green-50 text-green-700 hover:bg-green-100"
                  }`}
                >
                  {point.actif ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingPoint ? "Modifier le point de contrôle" : "Nouveau point de contrôle"}
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
