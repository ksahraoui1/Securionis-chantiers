"use client";

import {
  HEX_TYPE,
  LIBELLES_DIFFERENCE,
  type TypeDifference,
} from "@/lib/plan-diff-detection";

const NAVY = "#002855";
const ORANGE = "#E67E22";

export const TYPES_DIFFERENCE: TypeDifference[] = [
  "added",
  "removed",
  "modified",
  "moved",
];

/**
 * Barre de contrôle du calque des écarts.
 *
 * Le filtre de confiance est **le même** que celui du panneau latéral : deux
 * curseurs indépendants finiraient par se contredire, et l'utilisateur ne
 * saurait plus lequel gouverne ce qu'il voit.
 */
export function ControlesEcarts({
  visible,
  opacite,
  typesActifs,
  confianceMin,
  nbAffiches,
  nbTotal,
  nbAnnotees,
  onVisible,
  onOpacite,
  onType,
  onConfiance,
  onToutAccepter,
  onToutRejeter,
}: {
  visible: boolean;
  opacite: number;
  typesActifs: Set<TypeDifference>;
  confianceMin: number;
  nbAffiches: number;
  nbTotal: number;
  nbAnnotees: number;
  onVisible: (visible: boolean) => void;
  onOpacite: (opacite: number) => void;
  onType: (type: TypeDifference, actif: boolean) => void;
  onConfiance: (valeur: number) => void;
  onToutAccepter: () => void;
  onToutRejeter: () => void;
}) {
  const rienAAccepter = nbAffiches === 0 || nbAffiches === nbAnnotees;

  return (
    <div className="flex items-center gap-x-3 gap-y-2 flex-wrap border-b border-gray-200 px-3 py-2 bg-white">
      <button
        type="button"
        onClick={() => onVisible(!visible)}
        aria-pressed={visible}
        title={
          visible
            ? "Masquer les écarts sur le plan"
            : "Afficher les écarts sur le plan"
        }
        className={`inline-flex items-center gap-1.5 min-h-touch px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          visible ? "text-white" : "hover:bg-[#002855]/10"
        }`}
        style={visible ? { backgroundColor: NAVY } : { color: NAVY }}
      >
        <span translate="no" className="material-symbols-outlined text-lg">
          {visible ? "visibility" : "visibility_off"}
        </span>
        <span className="hidden sm:inline">
          {visible ? "Masquer les écarts" : "Afficher les écarts"}
        </span>
      </button>

      <div className="w-px h-6 bg-gray-300" />

      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <span className="whitespace-nowrap">Opacité</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(opacite * 100)}
          onChange={(e) => onOpacite(Number(e.target.value) / 100)}
          disabled={!visible}
          className="w-24 disabled:opacity-40"
          style={{ accentColor: ORANGE }}
          aria-label="Opacité des écarts"
        />
        <span
          className="tabular-nums font-semibold w-9 text-right"
          style={{ color: NAVY }}
        >
          {Math.round(opacite * 100)} %
        </span>
      </label>

      <div className="w-px h-6 bg-gray-300" />

      <fieldset className="flex items-center gap-1.5 flex-wrap">
        <legend className="sr-only">Types d&apos;écart affichés</legend>
        {TYPES_DIFFERENCE.map((type) => {
          const actif = typesActifs.has(type);
          return (
            <label
              key={type}
              className={`inline-flex items-center gap-1.5 px-2 py-1 min-h-touch rounded-full border text-[11px] font-medium cursor-pointer transition-colors ${
                actif
                  ? "border-transparent text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
              }`}
              style={actif ? { backgroundColor: HEX_TYPE[type] } : undefined}
            >
              <input
                type="checkbox"
                checked={actif}
                onChange={(e) => onType(type, e.target.checked)}
                disabled={!visible}
                className="sr-only"
              />
              <span
                className="w-2.5 h-2.5 rounded-sm border border-black/15"
                style={{
                  backgroundColor: actif ? "rgba(255,255,255,0.9)" : HEX_TYPE[type],
                }}
              />
              {LIBELLES_DIFFERENCE[type]}
            </label>
          );
        })}
      </fieldset>

      <div className="w-px h-6 bg-gray-300" />

      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <span className="whitespace-nowrap">Confiance min.</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={confianceMin}
          onChange={(e) => onConfiance(Number(e.target.value))}
          className="w-24"
          style={{ accentColor: ORANGE }}
          aria-label="Confiance minimale"
        />
        <span
          className="tabular-nums font-semibold w-9 text-right"
          style={{ color: NAVY }}
        >
          {confianceMin} %
        </span>
      </label>

      <span className="text-[11px] text-gray-500 whitespace-nowrap">
        {nbAffiches} / {nbTotal} affiché{nbAffiches > 1 ? "s" : ""}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToutAccepter}
          disabled={rienAAccepter}
          title="Créer une annotation pour chaque écart affiché"
          className="inline-flex items-center gap-1.5 min-h-touch px-2.5 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: "#2E7D32" }}
        >
          <span translate="no" className="material-symbols-outlined text-base">
            done_all
          </span>
          Tout accepter
        </button>
        <button
          type="button"
          onClick={onToutRejeter}
          disabled={nbTotal === 0}
          title="Écarter le résultat de la détection et masquer le calque"
          className="inline-flex items-center gap-1.5 min-h-touch px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium hover:bg-gray-100 disabled:opacity-40 transition-colors"
          style={{ color: NAVY }}
        >
          <span translate="no" className="material-symbols-outlined text-base">
            block
          </span>
          Tout rejeter
        </button>
      </div>
    </div>
  );
}
