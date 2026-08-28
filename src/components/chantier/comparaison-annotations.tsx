"use client";

import { useEffect, useRef, useState } from "react";
import type OpenSeadragonNS from "openseadragon";

type OSDStatic = typeof OpenSeadragonNS;
type Viewer = OpenSeadragonNS.Viewer;

export type OutilAnnotation =
  | "pan"
  | "arrow"
  | "circle"
  | "rect"
  | "text"
  | "highlight";

export type CouleurAnnotation = "red" | "orange" | "green" | "yellow";

export interface Annotation {
  id: string;
  type: Exclude<OutilAnnotation, "pan">;
  x: number;
  y: number;
  width: number;
  height: number;
  color: CouleurAnnotation;
  commentaire: string | null;
}

export type Geometrie = Pick<Annotation, "x" | "y" | "width" | "height">;

const NAVY = "#002855";

export const OUTILS: {
  valeur: OutilAnnotation;
  icone: string;
  libelle: string;
}[] = [
  { valeur: "pan", icone: "pan_tool", libelle: "Main" },
  { valeur: "arrow", icone: "arrow_outward", libelle: "Flèche" },
  { valeur: "circle", icone: "circle", libelle: "Cercle" },
  { valeur: "rect", icone: "crop_square", libelle: "Rectangle" },
  { valeur: "text", icone: "title", libelle: "Texte" },
  { valeur: "highlight", icone: "ink_highlighter", libelle: "Marqueur" },
];

export const COULEURS: {
  valeur: CouleurAnnotation;
  hex: string;
  libelle: string;
}[] = [
  { valeur: "red", hex: "#DC2626", libelle: "Critique" },
  { valeur: "orange", hex: "#E67E22", libelle: "Moyen" },
  { valeur: "green", hex: "#2E7D32", libelle: "Résolu" },
  { valeur: "yellow", hex: "#EAB308", libelle: "Info" },
];

const HEX: Record<CouleurAnnotation, string> = Object.fromEntries(
  COULEURS.map((c) => [c.valeur, c.hex])
) as Record<CouleurAnnotation, string>;

const LIBELLE_COULEUR: Record<CouleurAnnotation, string> = Object.fromEntries(
  COULEURS.map((c) => [c.valeur, c.libelle])
) as Record<CouleurAnnotation, string>;

// Taille par défaut d'une étiquette de texte, en unités monde
const TAILLE_TEXTE = { width: 0.2, height: 0.025 };
// En deçà, un tracé est considéré comme un clic accidentel
const TAILLE_MINIMALE = 0.004;

function normaliser(geo: Geometrie): Geometrie {
  return {
    x: geo.width < 0 ? geo.x + geo.width : geo.x,
    y: geo.height < 0 ? geo.y + geo.height : geo.y,
    width: Math.abs(geo.width),
    height: Math.abs(geo.height),
  };
}

// ============================================================
// Barre d'outils
// ============================================================

export function BarreOutilsAnnotation({
  outil,
  couleur,
  nbAnnotations,
  onOutil,
  onCouleur,
  onExporter,
}: {
  outil: OutilAnnotation;
  couleur: CouleurAnnotation;
  nbAnnotations: number;
  onOutil: (outil: OutilAnnotation) => void;
  onCouleur: (couleur: CouleurAnnotation) => void;
  onExporter: () => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap border-b border-gray-200 px-2 py-2 bg-white">
      {OUTILS.map((o) => {
        const actif = outil === o.valeur;
        return (
          <button
            key={o.valeur}
            type="button"
            onClick={() => onOutil(o.valeur)}
            title={o.libelle}
            aria-label={o.libelle}
            aria-pressed={actif}
            className={`inline-flex items-center gap-1.5 min-h-touch min-w-touch justify-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              actif ? "text-white" : "hover:bg-[#002855]/10"
            }`}
            style={actif ? { backgroundColor: NAVY } : { color: NAVY }}
          >
            <span className="material-symbols-outlined text-lg">{o.icone}</span>
            <span className="hidden lg:inline">{o.libelle}</span>
          </button>
        );
      })}

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {COULEURS.map((c) => {
        const actif = couleur === c.valeur;
        return (
          <button
            key={c.valeur}
            type="button"
            onClick={() => onCouleur(c.valeur)}
            title={`${c.libelle}`}
            aria-label={`Couleur : ${c.libelle}`}
            aria-pressed={actif}
            className={`inline-flex items-center justify-center min-h-touch min-w-touch w-9 h-9 rounded-lg transition-all ${
              actif ? "ring-2 ring-offset-1 ring-[#002855]" : ""
            }`}
          >
            <span
              className="w-5 h-5 rounded-full border border-black/10"
              style={{ backgroundColor: c.hex }}
            />
          </button>
        );
      })}

      <button
        type="button"
        onClick={onExporter}
        disabled={nbAnnotations === 0}
        title="Exporter les annotations au format JSON"
        className="ml-auto inline-flex items-center gap-1.5 min-h-touch px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
        style={{ color: NAVY }}
      >
        <span className="material-symbols-outlined text-base">download</span>
        Exporter les annotations
      </button>
    </div>
  );
}

// ============================================================
// Couche de dessin, superposée au visualiseur
// ============================================================

type Interaction =
  | { mode: "deplacement"; id: string; depart: { x: number; y: number }; origine: Geometrie }
  | { mode: "redimension"; id: string; origine: Geometrie }
  | null;

export function CoucheAnnotations({
  viewer,
  osd,
  outil,
  couleur,
  annotations,
  selection,
  onSelection,
  onCreer,
  onGeometrie,
}: {
  viewer: Viewer | null;
  osd: OSDStatic | null;
  outil: OutilAnnotation;
  couleur: CouleurAnnotation;
  annotations: Annotation[];
  selection: string | null;
  onSelection: (id: string | null) => void;
  onCreer: (annotation: Omit<Annotation, "id" | "commentaire">) => void;
  onGeometrie: (id: string, geometrie: Geometrie) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vue, setVue] = useState({ x: 0, y: 0, k: 1 });
  const [brouillon, setBrouillon] = useState<Geometrie | null>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [apercu, setApercu] = useState<(Geometrie & { id: string }) | null>(null);

  // Suit le viewport OpenSeadragon : la couche est dessinée en unités monde,
  // seul le transform du groupe change quand on zoome ou se déplace.
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

  // Les gestes OpenSeadragon sont coupés dès qu'un outil de dessin est actif
  useEffect(() => {
    viewer?.setMouseNavEnabled(outil === "pan");
  }, [viewer, outil]);

  function pointMonde(e: React.PointerEvent): { x: number; y: number } | null {
    if (!viewer || !osd || !svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const p = viewer.viewport.pointFromPixel(
      new osd.Point(e.clientX - rect.left, e.clientY - rect.top),
      true
    );
    return { x: p.x, y: p.y };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (outil === "pan") return;
    const p = pointMonde(e);
    if (!p) return;

    svgRef.current?.setPointerCapture(e.pointerId);
    onSelection(null);

    if (outil === "text") {
      onCreer({
        type: "text",
        x: p.x,
        y: p.y,
        width: TAILLE_TEXTE.width,
        height: TAILLE_TEXTE.height,
        color: couleur,
      });
      return;
    }

    setBrouillon({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pointMonde(e);
    if (!p) return;

    if (interaction?.mode === "deplacement") {
      setApercu({
        id: interaction.id,
        ...interaction.origine,
        x: interaction.origine.x + (p.x - interaction.depart.x),
        y: interaction.origine.y + (p.y - interaction.depart.y),
      });
      return;
    }

    if (interaction?.mode === "redimension") {
      setApercu({
        id: interaction.id,
        x: interaction.origine.x,
        y: interaction.origine.y,
        width: p.x - interaction.origine.x,
        height: p.y - interaction.origine.y,
      });
      return;
    }

    if (brouillon) {
      setBrouillon({
        ...brouillon,
        width: p.x - brouillon.x,
        height: p.y - brouillon.y,
      });
    }
  }

  function terminerInteraction(e: React.PointerEvent) {
    svgRef.current?.releasePointerCapture?.(e.pointerId);

    if (interaction && apercu) {
      const geo =
        annotations.find((a) => a.id === interaction.id)?.type === "arrow"
          ? { x: apercu.x, y: apercu.y, width: apercu.width, height: apercu.height }
          : normaliser(apercu);
      onGeometrie(interaction.id, geo);
    }
    setInteraction(null);
    setApercu(null);

    if (brouillon) {
      const estFleche = outil === "arrow";
      const geo = estFleche ? brouillon : normaliser(brouillon);
      const assezGrand =
        Math.abs(brouillon.width) > TAILLE_MINIMALE ||
        Math.abs(brouillon.height) > TAILLE_MINIMALE;

      if (assezGrand && outil !== "pan" && outil !== "text") {
        onCreer({ type: outil, ...geo, color: couleur });
      }
      setBrouillon(null);
    }

    viewer?.setMouseNavEnabled(outil === "pan");
  }

  function demarrerDeplacement(e: React.PointerEvent, annotation: Annotation) {
    if (outil !== "pan") return; // en mode dessin, le clic sert à tracer
    e.stopPropagation();
    const p = pointMonde(e);
    if (!p) return;

    viewer?.setMouseNavEnabled(false);
    svgRef.current?.setPointerCapture(e.pointerId);
    onSelection(annotation.id);
    setInteraction({
      mode: "deplacement",
      id: annotation.id,
      depart: p,
      origine: {
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
      },
    });
    setApercu({
      id: annotation.id,
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    });
  }

  function demarrerRedimension(e: React.PointerEvent, annotation: Annotation) {
    e.stopPropagation();
    viewer?.setMouseNavEnabled(false);
    svgRef.current?.setPointerCapture(e.pointerId);
    setInteraction({
      mode: "redimension",
      id: annotation.id,
      origine: {
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
      },
    });
  }

  const interactif = outil !== "pan" || interaction !== null;
  // Taille constante à l'écran quel que soit le zoom
  const uniteEcran = vue.k > 0 ? 1 / vue.k : 1;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: interactif ? "auto" : "none",
        cursor: outil === "pan" ? "default" : "crosshair",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={terminerInteraction}
      onPointerCancel={terminerInteraction}
    >
      <g transform={`translate(${vue.x}, ${vue.y}) scale(${vue.k})`}>
        {annotations.map((annotation, index) => {
          const geo =
            apercu && apercu.id === annotation.id
              ? { ...annotation, ...apercu }
              : annotation;
          return (
            <Forme
              key={annotation.id}
              annotation={{ ...annotation, ...geo }}
              numero={index + 1}
              selectionnee={selection === annotation.id}
              uniteEcran={uniteEcran}
              interactive={outil === "pan"}
              onPointerDown={(e) => demarrerDeplacement(e, annotation)}
              onPoignee={(e) => demarrerRedimension(e, annotation)}
            />
          );
        })}

        {brouillon && outil !== "pan" && outil !== "text" && (
          <Forme
            annotation={{
              id: "brouillon",
              type: outil,
              ...(outil === "arrow" ? brouillon : normaliser(brouillon)),
              color: couleur,
              commentaire: null,
            }}
            numero={annotations.length + 1}
            selectionnee={false}
            uniteEcran={uniteEcran}
            interactive={false}
          />
        )}
      </g>
    </svg>
  );
}

function Forme({
  annotation,
  numero,
  selectionnee,
  uniteEcran,
  interactive,
  onPointerDown,
  onPoignee,
}: {
  annotation: Annotation;
  numero: number;
  selectionnee: boolean;
  uniteEcran: number;
  interactive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPoignee?: (e: React.PointerEvent) => void;
}) {
  const couleur = HEX[annotation.color];
  const { x, y, width, height } = annotation;
  const boite = normaliser({ x, y, width, height });

  const styleInteractif: React.CSSProperties = {
    pointerEvents: interactive ? "auto" : "none",
    cursor: interactive ? "move" : undefined,
  };

  let forme: React.ReactNode = null;

  if (annotation.type === "rect") {
    forme = (
      <rect
        x={boite.x}
        y={boite.y}
        width={boite.width}
        height={boite.height}
        fill="transparent"
        stroke={couleur}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={styleInteractif}
        onPointerDown={onPointerDown}
      />
    );
  } else if (annotation.type === "circle") {
    forme = (
      <ellipse
        cx={boite.x + boite.width / 2}
        cy={boite.y + boite.height / 2}
        rx={boite.width / 2}
        ry={boite.height / 2}
        fill="transparent"
        stroke={couleur}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={styleInteractif}
        onPointerDown={onPointerDown}
      />
    );
  } else if (annotation.type === "highlight") {
    forme = (
      <rect
        x={boite.x}
        y={boite.y}
        width={boite.width}
        height={boite.height}
        fill={couleur}
        fillOpacity={0.3}
        stroke={couleur}
        strokeOpacity={0.6}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        style={styleInteractif}
        onPointerDown={onPointerDown}
      />
    );
  } else if (annotation.type === "arrow") {
    const x2 = x + width;
    const y2 = y + height;
    const longueur = Math.hypot(width, height) || 1;
    const tete = Math.min(longueur * 0.25, longueur) || 0;
    const ux = width / longueur;
    const uy = height / longueur;
    const base = { x: x2 - ux * tete, y: y2 - uy * tete };
    const perp = { x: -uy * tete * 0.4, y: ux * tete * 0.4 };

    forme = (
      <g style={styleInteractif} onPointerDown={onPointerDown}>
        <line
          x1={x}
          y1={y}
          x2={base.x}
          y2={base.y}
          stroke={couleur}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={`${x2},${y2} ${base.x + perp.x},${base.y + perp.y} ${
            base.x - perp.x
          },${base.y - perp.y}`}
          fill={couleur}
        />
      </g>
    );
  } else {
    forme = (
      <text
        x={x}
        y={y + height}
        fontSize={height}
        fill={couleur}
        stroke="white"
        strokeWidth={4}
        paintOrder="stroke"
        vectorEffect="non-scaling-stroke"
        style={{ ...styleInteractif, fontWeight: 700 }}
        onPointerDown={onPointerDown}
      >
        {annotation.commentaire?.trim() || "Texte"}
      </text>
    );
  }

  const rayon = 9 * uniteEcran;

  return (
    <g>
      {forme}

      {/* Numéro, pour retrouver l'annotation dans la liste */}
      <g style={{ pointerEvents: "none" }}>
        <circle cx={boite.x} cy={boite.y} r={rayon} fill={couleur} />
        <text
          x={boite.x}
          y={boite.y + rayon * 0.35}
          textAnchor="middle"
          fontSize={rayon * 1.1}
          fill="white"
          fontWeight={700}
        >
          {numero}
        </text>
      </g>

      {selectionnee && (
        <>
          <rect
            x={boite.x - rayon * 0.4}
            y={boite.y - rayon * 0.4}
            width={boite.width + rayon * 0.8}
            height={boite.height + rayon * 0.8}
            fill="none"
            stroke={NAVY}
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
          <rect
            x={x + width - rayon * 0.6}
            y={y + height - rayon * 0.6}
            width={rayon * 1.2}
            height={rayon * 1.2}
            fill="white"
            stroke={NAVY}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "auto", cursor: "nwse-resize" }}
            onPointerDown={onPoignee}
          />
        </>
      )}
    </g>
  );
}

// ============================================================
// Liste des annotations
// ============================================================

export function ListeAnnotations({
  annotations,
  filtre,
  selection,
  onFiltre,
  onSelection,
  onCommentaire,
  onCouleur,
  onSupprimer,
}: {
  annotations: Annotation[];
  filtre: CouleurAnnotation | "all";
  selection: string | null;
  onFiltre: (filtre: CouleurAnnotation | "all") => void;
  onSelection: (id: string | null) => void;
  onCommentaire: (id: string, commentaire: string) => void;
  onCouleur: (id: string, couleur: CouleurAnnotation) => void;
  onSupprimer: (id: string) => void;
}) {
  const visibles = annotations
    .map((a, index) => ({ annotation: a, numero: index + 1 }))
    .filter(({ annotation }) => filtre === "all" || annotation.color === filtre);

  return (
    <div className="border-t border-gray-200 px-4 py-3 bg-white space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold" style={{ color: NAVY }}>
          Annotations ({annotations.length})
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PastilleFiltre
            libelle="Toutes"
            nombre={annotations.length}
            actif={filtre === "all"}
            onClick={() => onFiltre("all")}
          />
          {COULEURS.map((c) => (
            <PastilleFiltre
              key={c.valeur}
              libelle={c.libelle}
              hex={c.hex}
              nombre={annotations.filter((a) => a.color === c.valeur).length}
              actif={filtre === c.valeur}
              onClick={() => onFiltre(c.valeur)}
            />
          ))}
        </div>
      </div>

      {annotations.length === 0 && (
        <p className="text-xs text-gray-500">
          Aucune annotation. Choisissez un outil dans la barre ci-dessus, puis
          tracez sur le plan.
        </p>
      )}

      {annotations.length > 0 && visibles.length === 0 && (
        <p className="text-xs text-gray-500">
          Aucune annotation de cette couleur.
        </p>
      )}

      <ul className="space-y-1.5 max-h-56 overflow-y-auto">
        {visibles.map(({ annotation, numero }) => (
          <li
            key={annotation.id}
            onClick={() => onSelection(annotation.id)}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
              selection === annotation.id
                ? "border-[#002855] bg-[#002855]/5"
                : "border-gray-200"
            }`}
          >
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: HEX[annotation.color] }}
            >
              {numero}
            </span>

            <span className="material-symbols-outlined text-base text-gray-400 shrink-0">
              {OUTILS.find((o) => o.valeur === annotation.type)?.icone ?? "shape_line"}
            </span>

            <input
              id={`commentaire-${annotation.id}`}
              type="text"
              value={annotation.commentaire ?? ""}
              onChange={(e) => onCommentaire(annotation.id, e.target.value)}
              placeholder="Commentaire…"
              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1 min-h-touch text-xs"
            />

            <select
              value={annotation.color}
              onChange={(e) =>
                onCouleur(annotation.id, e.target.value as CouleurAnnotation)
              }
              aria-label={`Couleur de l'annotation ${numero}`}
              className="rounded-lg border border-gray-300 px-1.5 py-1 min-h-touch text-xs shrink-0"
            >
              {COULEURS.map((c) => (
                <option key={c.valeur} value={c.valeur}>
                  {c.libelle}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSupprimer(annotation.id);
              }}
              title={`Supprimer l'annotation ${numero} (${LIBELLE_COULEUR[annotation.color]})`}
              aria-label={`Supprimer l'annotation ${numero}`}
              className="inline-flex items-center justify-center min-h-touch min-w-touch w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PastilleFiltre({
  libelle,
  hex,
  nombre,
  actif,
  onClick,
}: {
  libelle: string;
  hex?: string;
  nombre: number;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-touch rounded-full text-xs font-medium transition-colors ${
        actif
          ? "text-white"
          : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
      }`}
      style={actif ? { backgroundColor: NAVY } : undefined}
    >
      {hex && (
        <span
          className="w-2.5 h-2.5 rounded-full border border-black/10"
          style={{ backgroundColor: hex }}
        />
      )}
      {libelle}
      <span className={actif ? "opacity-70" : "text-gray-400"}>{nombre}</span>
    </button>
  );
}
