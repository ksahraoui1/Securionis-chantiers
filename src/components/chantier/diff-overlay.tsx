"use client";

import { useEffect, useRef, useState } from "react";
import type OpenSeadragonNS from "openseadragon";
import {
  HEX_TYPE,
  LIBELLES_DIFFERENCE,
  type TypeDifference,
  type ZoneAvancee,
} from "@/lib/plan-diff-detection";

type OSDStatic = typeof OpenSeadragonNS;
type Viewer = OpenSeadragonNS.Viewer;

const NAVY = "#002855";

/** Opacité d'un rectangle survolé. */
const OPACITE_SURVOL = 0.6;

export interface EcartAffiche {
  zone: ZoneAvancee;
  numero: number;
}

/**
 * Calque des écarts détectés, superposé au visualiseur.
 *
 * Même principe que la couche d'annotations : un SVG en coordonnées monde
 * OpenSeadragon, dont le groupe porte le `transform` du viewport. Le zoom et le
 * déplacement sont donc suivis par construction, sans recalcul par rectangle.
 *
 * Le SVG lui-même est transparent aux pointeurs ; seuls les rectangles les
 * captent. Le calque ne gêne donc ni le déplacement de la vue, ni la couche
 * d'annotations posée au-dessus.
 */
export function DiffOverlay({
  viewer,
  osd,
  ecarts,
  largeur,
  opacite,
  selection,
  onSelection,
}: {
  viewer: Viewer | null;
  osd: OSDStatic | null;
  /** Écarts déjà filtrés par type et par confiance. */
  ecarts: EcartAffiche[];
  /** Largeur, en pixels, du repère dans lequel les zones sont exprimées. */
  largeur: number;
  /** Opacité de remplissage, de 0 à 1. */
  opacite: number;
  selection: number | null;
  onSelection: (numero: number | null) => void;
}) {
  const [vue, setVue] = useState({ x: 0, y: 0, k: 1 });
  const [survol, setSurvol] = useState<{
    ecart: EcartAffiche;
    x: number;
    y: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Suit le viewport : seul le transform du groupe change au zoom et au pan.
  useEffect(() => {
    if (!viewer || !osd) return;

    const majVue = () => {
      const origine = viewer.viewport.pixelFromPoint(new osd.Point(0, 0), true);
      const echelle = viewer.viewport.deltaPixelsFromPoints(
        new osd.Point(1, 0),
        true
      ).x;
      setVue({ x: origine.x, y: origine.y, k: echelle });
    };

    majVue();
    viewer.addHandler("update-viewport", majVue);
    viewer.addHandler("resize", majVue);
    return () => {
      viewer.removeHandler("update-viewport", majVue);
      viewer.removeHandler("resize", majVue);
    };
  }, [viewer, osd]);

  if (largeur <= 0) return null;

  // Les zones sont en pixels du repère d'analyse ; le plan PE fait 1 de large
  // en unités monde. L'échelle étant isotrope, les deux axes se divisent par la
  // largeur.
  const versMonde = (valeur: number) => valeur / largeur;

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
        aria-hidden
      >
        <g transform={`translate(${vue.x}, ${vue.y}) scale(${vue.k})`}>
          {ecarts.map((ecart) => {
            const { zone, numero } = ecart;
            const couleur = HEX_TYPE[zone.type];
            const survole = survol?.ecart.numero === numero;
            const selectionne = selection === numero;

            return (
              <rect
                key={numero}
                x={versMonde(zone.x)}
                y={versMonde(zone.y)}
                width={versMonde(zone.width)}
                height={versMonde(zone.height)}
                fill={couleur}
                fillOpacity={survole ? OPACITE_SURVOL : opacite}
                stroke={couleur}
                strokeWidth={selectionne ? 3 : 1.5}
                strokeOpacity={0.9}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelection(selectionne ? null : numero);
                }}
                onPointerMove={(e) =>
                  setSurvol({ ecart, x: e.clientX, y: e.clientY })
                }
                onPointerLeave={() => setSurvol(null)}
              />
            );
          })}
        </g>
      </svg>

      {survol && <Infobulle ecart={survol.ecart} x={survol.x} y={survol.y} />}
    </>
  );
}

/**
 * Infobulle de survol.
 *
 * Positionnée en `fixed` sur les coordonnées du pointeur : le SVG est en
 * coordonnées monde, une infobulle qui y vivrait grossirait avec le zoom.
 */
function Infobulle({
  ecart,
  x,
  y,
}: {
  ecart: EcartAffiche;
  x: number;
  y: number;
}) {
  const { zone, numero } = ecart;
  const couleur = HEX_TYPE[zone.type];

  return (
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none rounded-lg border border-gray-300 bg-white shadow-lg px-2.5 py-1.5 text-[11px] leading-relaxed"
      style={{
        // Décalé du curseur pour ne pas masquer la zone désignée.
        left: Math.min(x + 14, (globalThis.innerWidth ?? 0) - 190),
        top: Math.max(8, y - 96),
        minWidth: 168,
      }}
    >
      <p className="font-bold flex items-center gap-1.5" style={{ color: couleur }}>
        <span
          className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0"
          style={{ backgroundColor: couleur }}
        />
        {LIBELLES_DIFFERENCE[zone.type]}
        <span className="ml-auto font-normal text-gray-400">n° {numero}</span>
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-gray-600">
        <dt>Confiance</dt>
        <dd className="text-right tabular-nums font-semibold" style={{ color: NAVY }}>
          {Math.round(zone.confiance * 100)} %
        </dd>
        <dt>Surface</dt>
        <dd className="text-right tabular-nums">
          {formaterSurface(zone.aireRelative)}
        </dd>
        <dt>Position</dt>
        <dd className="text-right tabular-nums">
          {Math.round(zone.x)} ; {Math.round(zone.y)} px
        </dd>
      </dl>
    </div>
  );
}

function formaterSurface(aireRelative: number): string {
  const pourcent = aireRelative * 100;
  if (pourcent >= 1) return `${pourcent.toFixed(1)} %`;
  if (pourcent >= 0.01) return `${pourcent.toFixed(2)} %`;
  return "< 0,01 %";
}

/** Légende du code couleur, posée en bas à droite du visualiseur. */
export function LegendeEcarts({ types }: { types: TypeDifference[] }) {
  return (
    <div className="absolute bottom-2 right-2 z-10 rounded-lg border border-gray-300 bg-white/95 shadow-sm px-2 py-1.5 pointer-events-none">
      <ul className="flex items-center gap-3 flex-wrap text-[11px]">
        {types.map((type) => (
          <li key={type} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="w-3 h-3 rounded-sm border border-black/15"
              style={{ backgroundColor: HEX_TYPE[type] }}
            />
            <span style={{ color: NAVY }}>{LIBELLES_DIFFERENCE[type]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
