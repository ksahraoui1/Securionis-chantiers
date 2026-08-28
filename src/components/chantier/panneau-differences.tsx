"use client";

import { useMemo, useState } from "react";
import {
  HEX_TYPE,
  ICONES_DIFFERENCE,
  LIBELLES_DIFFERENCE,
  type TypeDifference,
  type ZoneAvancee,
} from "@/lib/plan-diff-detection";

const NAVY = "#002855";
const ORANGE = "#E67E22";

type Colonne = "type" | "confiance" | "surface";

interface Tri {
  colonne: Colonne;
  descendant: boolean;
}

// Ordre d'affichage des types quand on trie par type
const RANG_TYPE: Record<TypeDifference, number> = {
  removed: 0,
  added: 1,
  moved: 2,
  modified: 3,
};

export function PanneauDifferences({
  zones,
  annotees,
  confianceMin,
  selection,
  onConfiance,
  onSelection,
  onAnnoter,
  onFermer,
}: {
  zones: ZoneAvancee[];
  /** Index des zones déjà reportées en annotation. */
  annotees: Set<number>;
  /** Seuil partagé avec les contrôles du calque. */
  confianceMin: number;
  selection: number | null;
  onConfiance: (valeur: number) => void;
  onSelection: (numero: number | null) => void;
  onAnnoter: (zone: ZoneAvancee, numero: number) => void;
  onFermer: () => void;
}) {
  const [tri, setTri] = useState<Tri>({ colonne: "confiance", descendant: true });

  // Le numéro est figé sur l'ordre d'origine (par confiance décroissante) :
  // il doit rester stable quand l'utilisateur change le tri.
  const numerotees = useMemo(
    () => zones.map((zone, index) => ({ zone, numero: index + 1 })),
    [zones]
  );

  const visibles = useMemo(() => {
    const seuil = confianceMin / 100;
    const filtrees = numerotees.filter(
      ({ zone }) => zone.confiance >= seuil
    );

    const sens = tri.descendant ? -1 : 1;
    return [...filtrees].sort((a, b) => {
      if (tri.colonne === "type") {
        return (RANG_TYPE[a.zone.type] - RANG_TYPE[b.zone.type]) * sens;
      }
      if (tri.colonne === "surface") {
        return (a.zone.aireRelative - b.zone.aireRelative) * sens;
      }
      return (a.zone.confiance - b.zone.confiance) * sens;
    });
  }, [numerotees, confianceMin, tri]);

  const basculerTri = (colonne: Colonne) =>
    setTri((precedent) =>
      precedent.colonne === colonne
        ? { colonne, descendant: !precedent.descendant }
        : { colonne, descendant: true }
    );

  return (
    <aside className="flex flex-col border-t lg:border-t-0 lg:border-l border-gray-200 bg-white lg:w-[420px] xl:w-[480px] shrink-0 max-h-[65vh] lg:max-h-none">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <p
          className="text-sm font-semibold flex items-center gap-1.5"
          style={{ color: NAVY }}
        >
          <span translate="no" className="material-symbols-outlined text-base">
            troubleshoot
          </span>
          Différences détectées
          <span
            className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            {zones.length}
          </span>
        </p>
        <button
          type="button"
          onClick={onFermer}
          title="Fermer le panneau"
          aria-label="Fermer le panneau"
          className="inline-flex items-center justify-center min-h-touch min-w-touch w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors"
        >
          <span translate="no" className="material-symbols-outlined text-base">
            close
          </span>
        </button>
      </div>

      {/* Filtre par confiance */}
      <div className="px-3 py-2 border-b border-gray-200 space-y-1">
        <label
          htmlFor="confiance-min"
          className="flex items-center justify-between text-xs font-medium text-gray-600"
        >
          <span>Confiance minimale</span>
          <span className="tabular-nums font-semibold" style={{ color: NAVY }}>
            {confianceMin} %
          </span>
        </label>
        <input
          id="confiance-min"
          type="range"
          min={0}
          max={100}
          step={5}
          value={confianceMin}
          onChange={(e) => onConfiance(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: ORANGE }}
        />
        <p className="text-[11px] text-gray-500">
          {visibles.length} différence{visibles.length > 1 ? "s" : ""} affichée
          {visibles.length > 1 ? "s" : ""} sur {zones.length}
        </p>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 shadow-[0_1px_0_#e5e7eb]">
            <tr className="text-left text-gray-600">
              <th className="px-2 py-1.5 font-semibold w-8">#</th>
              <EnTeteTriable
                libelle="Type"
                colonne="type"
                tri={tri}
                onTri={basculerTri}
              />
              <EnTeteTriable
                libelle="Confiance"
                colonne="confiance"
                tri={tri}
                onTri={basculerTri}
              />
              <EnTeteTriable
                libelle="Surface"
                colonne="surface"
                tri={tri}
                onTri={basculerTri}
              />
              <th className="px-2 py-1.5 font-semibold">Aperçu</th>
              <th className="px-2 py-1.5 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ zone, numero }) => (
              <tr
                key={numero}
                onClick={() => onSelection(selection === numero ? null : numero)}
                className={`border-b border-gray-100 align-middle cursor-pointer ${
                  selection === numero
                    ? "bg-[#002855]/5 outline outline-1 outline-[#002855]/30"
                    : "hover:bg-gray-50"
                }`}
              >
                <td className="px-2 py-1.5 tabular-nums text-gray-500">
                  {numero}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className="inline-flex items-center gap-1 whitespace-nowrap font-medium"
                    style={{ color: HEX_TYPE[zone.type] }}
                  >
                    <span
                      translate="no"
                      className="material-symbols-outlined text-base"
                    >
                      {ICONES_DIFFERENCE[zone.type]}
                    </span>
                    {LIBELLES_DIFFERENCE[zone.type]}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <JaugeConfiance valeur={zone.confiance} />
                </td>
                <td className="px-2 py-1.5 tabular-nums text-gray-600 whitespace-nowrap">
                  {formaterSurface(zone.aireRelative)}
                </td>
                <td className="px-2 py-1.5">
                  {zone.apercu ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={zone.apercu}
                      alt={`Aperçu de la différence ${numero} : plan PE à gauche, EXE à droite`}
                      className="h-10 w-auto max-w-[120px] rounded border border-gray-300"
                    />
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {annotees.has(numero) ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-green-700 whitespace-nowrap">
                      <span
                        translate="no"
                        className="material-symbols-outlined text-sm"
                      >
                        check_circle
                      </span>
                      Annotée
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnnoter(zone, numero);
                      }}
                      title="Créer une annotation sur la vue de comparaison"
                      className="inline-flex items-center gap-1 px-2 py-1 min-h-touch rounded-lg text-[11px] font-medium text-white hover:opacity-90 transition-opacity whitespace-nowrap"
                      style={{ backgroundColor: NAVY }}
                    >
                      <span
                        translate="no"
                        className="material-symbols-outlined text-sm"
                      >
                        add_comment
                      </span>
                      Annoter
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibles.length === 0 && (
          <p className="px-3 py-4 text-xs text-gray-500">
            Aucune différence au-dessus de {confianceMin} % de confiance.
            Abaissez le seuil pour en voir davantage.
          </p>
        )}
      </div>
    </aside>
  );
}

function EnTeteTriable({
  libelle,
  colonne,
  tri,
  onTri,
}: {
  libelle: string;
  colonne: Colonne;
  tri: Tri;
  onTri: (colonne: Colonne) => void;
}) {
  const actif = tri.colonne === colonne;
  return (
    <th
      className="px-2 py-1.5 font-semibold"
      aria-sort={actif ? (tri.descendant ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onTri(colonne)}
        className="inline-flex items-center gap-0.5 hover:underline"
        style={actif ? { color: NAVY } : undefined}
      >
        {libelle}
        <span
          translate="no"
          className={`material-symbols-outlined text-sm ${
            actif ? "" : "opacity-30"
          }`}
        >
          {actif && !tri.descendant ? "arrow_upward" : "arrow_downward"}
        </span>
      </button>
    </th>
  );
}

function JaugeConfiance({ valeur }: { valeur: number }) {
  const pourcent = Math.round(valeur * 100);
  // Vert au-dessus de 70 %, orange entre 40 et 70, gris en dessous.
  const couleur =
    pourcent >= 70 ? "#2E7D32" : pourcent >= 40 ? ORANGE : "#9ca3af";

  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-12 rounded-full bg-gray-200 overflow-hidden shrink-0">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pourcent}%`, backgroundColor: couleur }}
        />
      </span>
      <span className="tabular-nums font-semibold" style={{ color: couleur }}>
        {pourcent} %
      </span>
    </span>
  );
}

/** Une différence occupe rarement 1 % de la page : on descend au centième. */
function formaterSurface(aireRelative: number): string {
  const pourcent = aireRelative * 100;
  if (pourcent >= 1) return `${pourcent.toFixed(1)} %`;
  if (pourcent >= 0.01) return `${pourcent.toFixed(2)} %`;
  return "< 0,01 %";
}
