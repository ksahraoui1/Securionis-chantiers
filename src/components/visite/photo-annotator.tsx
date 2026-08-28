"use client";

import { useRef, useState, useEffect, useCallback, useReducer } from "react";
import {
  renderAnnotations,
  type Annotation,
  type AnnotationPoint as Point,
  type AnnotationTool as Tool,
} from "@/lib/utils/canvas-annotations";

interface PhotoAnnotatorProps {
  imageUrl: string;
  onSave: (annotatedBlob: Blob) => void;
  onCancel: () => void;
}

const COLORS = ["#F63A35", "#006E2D", "#131B2E", "#f59e0b", "#ffffff"];
const STROKE_WIDTHS = [2, 4, 6];

interface ToolSettings {
  color: string;
  strokeWidth: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "drawing"; current: Annotation }
  | { kind: "placing-text"; position: Point };

interface CanvasState {
  annotations: Annotation[];
  phase: Phase;
}

type CanvasAction =
  | { type: "pointer-down"; tool: Tool; point: Point; settings: ToolSettings }
  | { type: "pointer-move"; point: Point }
  | { type: "pointer-up" }
  | { type: "submit-text"; text: string; settings: ToolSettings }
  | { type: "cancel-text" }
  | { type: "undo" };

const INITIAL_STATE: CanvasState = {
  annotations: [],
  phase: { kind: "idle" },
};

function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "pointer-down": {
      if (action.tool === "text") {
        return {
          ...state,
          phase: { kind: "placing-text", position: action.point },
        };
      }
      const { point, settings } = action;
      let current: Annotation;
      switch (action.tool) {
        case "arrow":
          current = { type: "arrow", ...settings, start: point, end: point };
          break;
        case "circle":
          current = { type: "circle", ...settings, center: point, radius: 0 };
          break;
        case "freehand":
          current = { type: "freehand", ...settings, points: [point] };
          break;
        default:
          return state;
      }
      return { ...state, phase: { kind: "drawing", current } };
    }
    case "pointer-move": {
      if (state.phase.kind !== "drawing") return state;
      const { current } = state.phase;
      const p = action.point;
      let updated: Annotation;
      if (current.type === "arrow") {
        updated = { ...current, end: p };
      } else if (current.type === "circle" && current.center) {
        const dx = p.x - current.center.x;
        const dy = p.y - current.center.y;
        updated = { ...current, radius: Math.sqrt(dx * dx + dy * dy) };
      } else if (current.type === "freehand" && current.points) {
        updated = { ...current, points: [...current.points, p] };
      } else {
        return state;
      }
      return { ...state, phase: { kind: "drawing", current: updated } };
    }
    case "pointer-up": {
      if (state.phase.kind !== "drawing") return state;
      return {
        annotations: [...state.annotations, state.phase.current],
        phase: { kind: "idle" },
      };
    }
    case "submit-text": {
      if (state.phase.kind !== "placing-text") return state;
      const trimmed = action.text.trim();
      if (!trimmed) return state;
      return {
        annotations: [
          ...state.annotations,
          {
            type: "text",
            ...action.settings,
            position: state.phase.position,
            text: trimmed,
          },
        ],
        phase: { kind: "idle" },
      };
    }
    case "cancel-text": {
      if (state.phase.kind !== "placing-text") return state;
      return { ...state, phase: { kind: "idle" } };
    }
    case "undo": {
      return { ...state, annotations: state.annotations.slice(0, -1) };
    }
  }
}

export function PhotoAnnotator({ imageUrl, onSave, onCancel }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [state, dispatch] = useReducer(canvasReducer, INITIAL_STATE);
  const [textInput, setTextInput] = useState("");
  const [ready, setReady] = useState(false);
  const [canvasCss, setCanvasCss] = useState({ width: 300, height: 200 });

  const settings: ToolSettings = { color, strokeWidth };
  const currentAnnotation =
    state.phase.kind === "drawing" ? state.phase.current : null;
  const textPosition =
    state.phase.kind === "placing-text" ? state.phase.position : null;

  // Draw everything onto the canvas
  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || sizeRef.current.width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const allAnnotations = currentAnnotation
      ? [...state.annotations, currentAnnotation]
      : state.annotations;

    renderAnnotations(ctx, allAnnotations);
  }, [state.annotations, currentAnnotation]);

  // Load image and set up canvas in one effect
  useEffect(() => {
    const img = new Image();
    if (!imageUrl.startsWith("blob:") && !imageUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }

    function onLoad() {
      imageRef.current = img;

      const maxW = window.innerWidth - 32;
      const maxH = window.innerHeight - 220;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w === 0 || h === 0) return;

      const ratio = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);

      sizeRef.current = { width: w, height: h };
      setCanvasCss({ width: w, height: h });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
        }
      }

      setReady(true);
    }

    img.onload = onLoad;
    img.onerror = () => {
      const retry = new Image();
      retry.onload = () => {
        img.crossOrigin = "";
        imageRef.current = retry;
        onLoad.call(null);
      };
      retry.src = imageUrl;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (ready) drawAll();
  }, [ready, drawAll]);

  function getCanvasPoint(e: React.MouseEvent | React.TouchEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!ready) return;
    dispatch({ type: "pointer-down", tool, point: getCanvasPoint(e), settings });
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (state.phase.kind !== "drawing") return;
    dispatch({ type: "pointer-move", point: getCanvasPoint(e) });
  }

  function handlePointerUp() {
    if (state.phase.kind === "drawing") dispatch({ type: "pointer-up" });
  }

  function handleTextSubmit() {
    dispatch({ type: "submit-text", text: textInput, settings });
    setTextInput("");
  }

  function handleTextCancel() {
    dispatch({ type: "cancel-text" });
    setTextInput("");
  }

  function handleSave() {
    const img = imageRef.current;
    if (!img) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = img.naturalWidth;
    exportCanvas.height = img.naturalHeight;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    const fullScale = img.naturalWidth / sizeRef.current.width;
    renderAnnotations(ctx, state.annotations, { scale: fullScale });

    exportCanvas.toBlob(
      (blob) => {
        if (blob) onSave(blob);
      },
      "image/jpeg",
      0.9,
    );
  }

  const tools: { key: Tool; icon: string; label: string }[] = [
    { key: "arrow", icon: "north_east", label: "Flèche" },
    { key: "circle", icon: "circle", label: "Cercle" },
    { key: "text", icon: "title", label: "Texte" },
    { key: "freehand", icon: "draw", label: "Libre" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
        <button
          onClick={onCancel}
          className="text-white/80 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <span translate="no" className="material-symbols-outlined">close</span>
        </button>
        <span className="text-white font-bold text-sm">Annoter la photo</span>
        <button
          onClick={handleSave}
          className="bg-white text-black font-bold px-4 py-2 rounded-lg min-h-[44px] text-sm"
        >
          Valider
        </button>
      </div>

      {/* Canvas area — always rendered */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-2">
        <canvas
          ref={canvasRef}
          width={canvasCss.width}
          height={canvasCss.height}
          className="touch-none"
          style={{
            width: canvasCss.width,
            height: canvasCss.height,
            display: ready ? "block" : "none",
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
        {!ready && (
          <p className="text-white text-sm">Chargement de l&apos;image...</p>
        )}
      </div>

      {/* Text input overlay */}
      {textPosition && (
        <div className="absolute inset-x-0 bottom-32 flex justify-center px-4 z-10">
          <div className="bg-white rounded-xl p-3 shadow-lg flex gap-2 w-full max-w-md">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Saisir le texte..."
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none min-h-[44px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTextSubmit();
                if (e.key === "Escape") handleTextCancel();
              }}
            />
            <button
              onClick={handleTextSubmit}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm min-h-[44px]"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="bg-black/60 px-4 py-3 space-y-3 pb-safe shrink-0">
        <div className="flex items-center justify-center gap-2">
          {tools.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                tool === t.key
                  ? "bg-white text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <span translate="no" className="material-symbols-outlined text-xl">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
            </button>
          ))}

          <div className="w-px h-8 bg-white/20 mx-1" />

          <button
            onClick={() => dispatch({ type: "undo" })}
            disabled={state.annotations.length === 0}
            className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-xl text-xs font-medium text-white/70 hover:text-white disabled:opacity-30"
          >
            <span translate="no" className="material-symbols-outlined text-xl">undo</span>
            <span className="mt-0.5">Annuler</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  color === c ? "border-white scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-white/20" />

          <div className="flex items-center gap-1">
            {STROKE_WIDTHS.map((sw) => (
              <button
                key={sw}
                onClick={() => setStrokeWidth(sw)}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors ${
                  strokeWidth === sw ? "bg-white/20" : ""
                }`}
              >
                <div
                  className="rounded-full bg-white"
                  style={{ width: sw * 3, height: sw * 3 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
