"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Tool = "arrow" | "circle" | "text" | "freehand";

interface Point {
  x: number;
  y: number;
}

interface Annotation {
  type: Tool;
  color: string;
  strokeWidth: number;
  start?: Point;
  end?: Point;
  center?: Point;
  radius?: number;
  position?: Point;
  text?: string;
  points?: Point[];
}

interface PhotoAnnotatorProps {
  imageUrl: string;
  onSave: (annotatedBlob: Blob) => void;
  onCancel: () => void;
}

const COLORS = ["#F63A35", "#006E2D", "#131B2E", "#f59e0b", "#ffffff"];
const STROKE_WIDTHS = [2, 4, 6];

export function PhotoAnnotator({ imageUrl, onSave, onCancel }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [ready, setReady] = useState(false);
  const [canvasCss, setCanvasCss] = useState({ width: 300, height: 200 });

  // Draw everything onto the canvas
  const drawAll = useCallback(
    (extraAnnotation?: Annotation | null) => {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      if (!canvas || !img || sizeRef.current.width === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const allAnnotations = extraAnnotation
        ? [...annotations, extraAnnotation]
        : annotations;

      for (const a of allAnnotations) {
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        ctx.lineWidth = a.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        switch (a.type) {
          case "arrow":
            if (a.start && a.end) drawArrow(ctx, a.start, a.end, a.strokeWidth);
            break;
          case "circle":
            if (a.center && a.radius) {
              ctx.beginPath();
              ctx.arc(a.center.x, a.center.y, a.radius, 0, Math.PI * 2);
              ctx.stroke();
            }
            break;
          case "text":
            if (a.position && a.text) {
              const fontSize = Math.max(16, a.strokeWidth * 6);
              ctx.font = `bold ${fontSize}px Inter, sans-serif`;
              const metrics = ctx.measureText(a.text);
              const pad = 4;
              ctx.fillStyle = "rgba(0,0,0,0.5)";
              ctx.fillRect(
                a.position.x - pad,
                a.position.y - fontSize - pad,
                metrics.width + pad * 2,
                fontSize + pad * 2
              );
              ctx.fillStyle = a.color;
              ctx.fillText(a.text, a.position.x, a.position.y);
            }
            break;
          case "freehand":
            if (a.points && a.points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(a.points[0].x, a.points[0].y);
              for (let i = 1; i < a.points.length; i++) {
                ctx.lineTo(a.points[i].x, a.points[i].y);
              }
              ctx.stroke();
            }
            break;
        }
      }
    },
    [annotations]
  );

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

      // Directly set canvas dimensions and draw — no waiting for React re-render
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
      // Retry without crossOrigin
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

  // Redraw when annotations change
  useEffect(() => {
    if (ready) drawAll();
  }, [ready, drawAll]);

  // Also redraw with live annotation while drawing
  useEffect(() => {
    if (ready && currentAnnotation) drawAll(currentAnnotation);
  }, [ready, currentAnnotation, drawAll]);

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
    if (tool === "text") {
      setTextPosition(getCanvasPoint(e));
      return;
    }

    setDrawing(true);
    const p = getCanvasPoint(e);

    if (tool === "arrow") {
      setCurrentAnnotation({ type: "arrow", color, strokeWidth, start: p, end: p });
    } else if (tool === "circle") {
      setCurrentAnnotation({ type: "circle", color, strokeWidth, center: p, radius: 0 });
    } else if (tool === "freehand") {
      setCurrentAnnotation({ type: "freehand", color, strokeWidth, points: [p] });
    }
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing || !currentAnnotation) return;
    const p = getCanvasPoint(e);

    if (currentAnnotation.type === "arrow") {
      setCurrentAnnotation({ ...currentAnnotation, end: p });
    } else if (currentAnnotation.type === "circle" && currentAnnotation.center) {
      const dx = p.x - currentAnnotation.center.x;
      const dy = p.y - currentAnnotation.center.y;
      setCurrentAnnotation({ ...currentAnnotation, radius: Math.sqrt(dx * dx + dy * dy) });
    } else if (currentAnnotation.type === "freehand" && currentAnnotation.points) {
      setCurrentAnnotation({ ...currentAnnotation, points: [...currentAnnotation.points, p] });
    }
  }

  function handlePointerUp() {
    if (drawing && currentAnnotation) {
      setAnnotations((prev) => [...prev, currentAnnotation]);
      setCurrentAnnotation(null);
    }
    setDrawing(false);
  }

  function handleTextSubmit() {
    if (textInput.trim() && textPosition) {
      setAnnotations((prev) => [
        ...prev,
        { type: "text", color, strokeWidth, position: textPosition, text: textInput.trim() },
      ]);
      setTextInput("");
      setTextPosition(null);
    }
  }

  function handleUndo() {
    setAnnotations((prev) => prev.slice(0, -1));
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

    for (const a of annotations) {
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.strokeWidth * fullScale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      switch (a.type) {
        case "arrow":
          if (a.start && a.end) {
            const start = { x: a.start.x * fullScale, y: a.start.y * fullScale };
            const end = { x: a.end.x * fullScale, y: a.end.y * fullScale };
            drawArrow(ctx, start, end, a.strokeWidth * fullScale);
          }
          break;
        case "circle":
          if (a.center && a.radius) {
            ctx.beginPath();
            ctx.arc(
              a.center.x * fullScale,
              a.center.y * fullScale,
              a.radius * fullScale,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
          break;
        case "text":
          if (a.position && a.text) {
            const fontSize = Math.max(16, a.strokeWidth * 6) * fullScale;
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            const metrics = ctx.measureText(a.text);
            const pad = 4 * fullScale;
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(
              a.position.x * fullScale - pad,
              a.position.y * fullScale - fontSize - pad,
              metrics.width + pad * 2,
              fontSize + pad * 2
            );
            ctx.fillStyle = a.color;
            ctx.fillText(a.text, a.position.x * fullScale, a.position.y * fullScale);
          }
          break;
        case "freehand":
          if (a.points && a.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(a.points[0].x * fullScale, a.points[0].y * fullScale);
            for (let i = 1; i < a.points.length; i++) {
              ctx.lineTo(a.points[i].x * fullScale, a.points[i].y * fullScale);
            }
            ctx.stroke();
          }
          break;
      }
    }

    exportCanvas.toBlob(
      (blob) => {
        if (blob) onSave(blob);
      },
      "image/jpeg",
      0.9
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
          <span className="material-symbols-outlined">close</span>
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
                if (e.key === "Escape") setTextPosition(null);
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
              <span className="material-symbols-outlined text-xl">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
            </button>
          ))}

          <div className="w-px h-8 bg-white/20 mx-1" />

          <button
            onClick={handleUndo}
            disabled={annotations.length === 0}
            className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-xl text-xs font-medium text-white/70 hover:text-white disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-xl">undo</span>
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

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, lineWidth: number) {
  const headLen = Math.max(lineWidth * 4, 12);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLen * Math.cos(angle - Math.PI / 6),
    end.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headLen * Math.cos(angle + Math.PI / 6),
    end.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}
