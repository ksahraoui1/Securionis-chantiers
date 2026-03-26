"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PointControleForm } from "@/components/admin/point-controle-form";
import { ImportExcelPoints } from "@/components/admin/import-excel-points";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/database";

type PointWithRelations = Tables<"points_controle"> & {
  categories: { libelle: string } | null;
  themes: { libelle: string } | null;
};

export default function AdminPointsControlePage() {
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [themes, setThemes] = useState<Tables<"themes">[]>([]);
  const [points, setPoints] = useState<PointWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCat, setFilterCat] = useState("");
  const [filterTheme, setFilterTheme] = useState("");
  const [filterActif, setFilterActif] = useState<"all" | "actif" | "inactif">("actif");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingPoint, setEditingPoint] = useState<Tables<"points_controle"> | null>(null);

  // Création catégorie / thème inline
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [savingCat, setSavingCat] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [showNewTheme, setShowNewTheme] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  // Load categories (new ones only: phase_id IS NULL)
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("categories")
        .select("*")
        .is("phase_id", null)
        .order("libelle");
      if (data) setCategories(data);
    }
    load();
  }, []);

  // Load themes filtered by category
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      let query = supabase.from("themes").select("*").order("libelle");
      if (filterCat) query = query.eq("categorie_id", filterCat);
      const { data } = await query;
      if (data) setThemes(data);
    }
    load();
    setFilterTheme("");
  }, [filterCat]);

  // Load points
  const loadPoints = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("points_controle")
      .select("*, categories(libelle), themes(libelle)")
      .not("theme_id", "is", null)
      .order("intitule");

    if (filterCat) query = query.eq("categorie_id", filterCat);
    if (filterTheme) query = query.eq("theme_id", filterTheme);
    if (filterActif === "actif") query = query.eq("actif", true);
    if (filterActif === "inactif") query = query.eq("actif", false);

    const { data } = await query;
    if (data) setPoints(data as PointWithRelations[]);
    setLoading(false);
  }, [filterCat, filterTheme, filterActif]);

  useEffect(() => {
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
      setFilterCat(data.id);
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

  const filtered = search
    ? points.filter(
        (p) =>
          p.intitule.toLowerCase().includes(search.toLowerCase()) ||
          p.base_legale?.toLowerCase().includes(search.toLowerCase()) ||
          p.objet?.toLowerCase().includes(search.toLowerCase())
      )
    : points;

  const activeCount = points.filter((p) => p.actif).length;
  const inactiveCount = points.filter((p) => !p.actif).length;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Points de contrôle</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} actifs · {inactiveCount} désactivés · {categories.length} catégories
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

      {/* Filtres */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Catégorie</label>
              <button
                type="button"
                onClick={() => setShowNewCat(!showNewCat)}
                className="text-[10px] text-blue-600 hover:underline"
              >
                {showNewCat ? "Annuler" : "+ Nouvelle"}
              </button>
            </div>
            {showNewCat ? (
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
                onChange={(e) => setFilterCat(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
              >
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
                disabled={!filterCat}
              >
                <option value="">Tous les thèmes</option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Statut
            </label>
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
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par intitulé, base légale, thème..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-touch"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-gray-500 py-8 text-center">Chargement...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Aucun point de contrôle trouvé.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 px-1">{filtered.length} résultats</p>
          {filtered.map((point) => (
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
                    {point.categories && (
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
