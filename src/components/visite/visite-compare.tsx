"use client";

import { useState, useEffect } from "react";

interface VisiteOption {
  id: string;
  date_visite: string;
  inspecteur_nom: string;
  nc_count: number;
}

interface CompareRow {
  pointControleId: string;
  intitule: string;
  objet: string | null;
  baseLegale: string | null;
  valeurA: string | null;
  valeurB: string | null;
  remarqueA: string | null;
  remarqueB: string | null;
  status: "corrigee" | "persistante" | "nouvelle" | "regression" | "identique" | "amelioree";
}

interface CompareData {
  visiteA: { id: string; date: string; inspecteur: string };
  visiteB: { id: string; date: string; inspecteur: string };
  rows: CompareRow[];
  summary: {
    corrigees: number;
    persistantes: number;
    nouvelles: number;
    ameliorees: number;
    identiques: number;
    total: number;
  };
}

interface VisiteCompareProps {
  visites: VisiteOption[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: string; bg: string; text: string }
> = {
  nouvelle: {
    label: "Nouvelle NC",
    icon: "add_circle",
    bg: "bg-red-100",
    text: "text-red-800",
  },
  persistante: {
    label: "Persiste",
    icon: "warning",
    bg: "bg-amber-100",
    text: "text-amber-800",
  },
  corrigee: {
    label: "Corrigée",
    icon: "check_circle",
    bg: "bg-green-100",
    text: "text-green-800",
  },
  amelioree: {
    label: "Améliorée",
    icon: "trending_up",
    bg: "bg-blue-100",
    text: "text-blue-800",
  },
  identique: {
    label: "Identique",
    icon: "remove",
    bg: "bg-gray-100",
    text: "text-gray-600",
  },
};

const VALEUR_LABELS: Record<string, { label: string; color: string }> = {
  conforme: { label: "Conforme", color: "text-green-700" },
  non_conforme: { label: "Non-conforme", color: "text-red-700" },
  pas_necessaire: { label: "Pas néc.", color: "text-gray-500" },
};

export function VisiteCompare({ visites }: VisiteCompareProps) {
  const [visiteAId, setVisiteAId] = useState("");
  const [visiteBId, setVisiteBId] = useState("");
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);

  // Auto-select the two most recent visits
  useEffect(() => {
    if (visites.length >= 2) {
      setVisiteAId(visites[1].id); // N-1 (older)
      setVisiteBId(visites[0].id); // N (newer)
    }
  }, [visites]);

  async function handleCompare() {
    if (!visiteAId || !visiteBId) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/visites/compare?visiteA=${visiteAId}&visiteB=${visiteBId}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur");
      }
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la comparaison");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  if (visites.length < 2) return null;

  const filteredRows = data?.rows.filter(
    (r) => filter === "all" || r.status === filter
  );

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">compare_arrows</span>
          Comparer deux visites
        </span>
        <span className="material-symbols-outlined text-lg">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-4">
          {/* Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Visite N-1 (ancienne)
              </label>
              <select
                value={visiteAId}
                onChange={(e) => setVisiteAId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
              >
                <option value="">Sélectionner...</option>
                {visites.map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatDate(v.date_visite)} — {v.inspecteur_nom}{" "}
                    {v.nc_count > 0 ? `(${v.nc_count} NC)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Visite N (récente)
              </label>
              <select
                value={visiteBId}
                onChange={(e) => setVisiteBId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-touch text-sm"
              >
                <option value="">Sélectionner...</option>
                {visites.map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatDate(v.date_visite)} — {v.inspecteur_nom}{" "}
                    {v.nc_count > 0 ? `(${v.nc_count} NC)` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleCompare}
            disabled={!visiteAId || !visiteBId || visiteAId === visiteBId || loading}
            className="w-full py-3 min-h-[44px] bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
          >
            {loading ? "Analyse en cours..." : "Comparer"}
          </button>

          {visiteAId === visiteBId && visiteAId && (
            <p className="text-sm text-amber-600">
              Sélectionnez deux visites différentes.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Results */}
          {data && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                <SummaryCard
                  label="Corrigées"
                  count={data.summary.corrigees}
                  icon="check_circle"
                  color="text-green-700"
                  bg="bg-green-50"
                />
                <SummaryCard
                  label="Persistantes"
                  count={data.summary.persistantes}
                  icon="warning"
                  color="text-amber-700"
                  bg="bg-amber-50"
                />
                <SummaryCard
                  label="Nouvelles"
                  count={data.summary.nouvelles}
                  icon="add_circle"
                  color="text-red-700"
                  bg="bg-red-50"
                />
                <SummaryCard
                  label="Améliorées"
                  count={data.summary.ameliorees}
                  icon="trending_up"
                  color="text-blue-700"
                  bg="bg-blue-50"
                />
                <SummaryCard
                  label="Identiques"
                  count={data.summary.identiques}
                  icon="remove"
                  color="text-gray-600"
                  bg="bg-gray-50"
                />
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[
                  { key: "all", label: "Tous", count: data.rows.length },
                  { key: "nouvelle", label: "Nouvelles", count: data.summary.nouvelles },
                  { key: "persistante", label: "Persistantes", count: data.summary.persistantes },
                  { key: "corrigee", label: "Corrigées", count: data.summary.corrigees },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap min-h-touch transition-colors ${
                      filter === tab.key
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tab.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      filter === tab.key ? "bg-white/20" : "bg-white"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Column headers */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_120px_120px_100px] gap-2 px-3 text-xs font-medium text-gray-500 uppercase">
                <span>Point de contrôle</span>
                <span className="text-center">
                  {formatDate(data.visiteA.date).slice(0, -5)}
                </span>
                <span className="text-center">
                  {formatDate(data.visiteB.date).slice(0, -5)}
                </span>
                <span className="text-center">Évolution</span>
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {filteredRows?.map((row) => {
                  const cfg = STATUS_CONFIG[row.status];
                  return (
                    <div
                      key={row.pointControleId}
                      className="bg-white rounded-lg border border-gray-200 p-3 sm:grid sm:grid-cols-[1fr_120px_120px_100px] sm:gap-2 sm:items-center"
                    >
                      {/* Point de contrôle */}
                      <div className="mb-2 sm:mb-0">
                        {row.objet && (
                          <span className="text-[10px] font-medium text-gray-400 uppercase">
                            {row.objet}
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-900 leading-tight">
                          {row.intitule}
                        </p>
                        {/* Remarques on mobile */}
                        {(row.remarqueA || row.remarqueB) && (
                          <div className="mt-1 sm:hidden">
                            {row.remarqueA && (
                              <p className="text-xs text-gray-500 italic">
                                N-1: {row.remarqueA}
                              </p>
                            )}
                            {row.remarqueB && (
                              <p className="text-xs text-gray-500 italic">
                                N: {row.remarqueB}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Valeur A (N-1) */}
                      <div className="flex sm:justify-center items-center gap-2 sm:gap-0">
                        <span className="text-xs text-gray-400 sm:hidden w-10">N-1:</span>
                        <ValeurBadge valeur={row.valeurA} />
                      </div>

                      {/* Valeur B (N) */}
                      <div className="flex sm:justify-center items-center gap-2 sm:gap-0">
                        <span className="text-xs text-gray-400 sm:hidden w-10">N:</span>
                        <ValeurBadge valeur={row.valeurB} />
                      </div>

                      {/* Status */}
                      <div className="flex sm:justify-center mt-2 sm:mt-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text}`}
                        >
                          <span className="material-symbols-outlined text-sm">
                            {cfg.icon}
                          </span>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredRows?.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Aucun point dans cette catégorie.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  icon,
  color,
  bg,
}: {
  label: string;
  count: number;
  icon: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
      <p className={`text-2xl font-bold ${color}`}>{count}</p>
      <p className="text-[10px] font-medium text-gray-600 uppercase">{label}</p>
    </div>
  );
}

function ValeurBadge({ valeur }: { valeur: string | null }) {
  if (!valeur) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const cfg = VALEUR_LABELS[valeur];
  if (!cfg) return <span className="text-xs text-gray-400">{valeur}</span>;
  return (
    <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
  );
}
