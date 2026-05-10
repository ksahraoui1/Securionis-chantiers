export type AnnotationTool = "arrow" | "circle" | "text" | "freehand";

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface Annotation {
  type: AnnotationTool;
  color: string;
  strokeWidth: number;
  start?: AnnotationPoint;
  end?: AnnotationPoint;
  center?: AnnotationPoint;
  radius?: number;
  position?: AnnotationPoint;
  text?: string;
  points?: AnnotationPoint[];
}

export interface RenderAnnotationsOptions {
  scale?: number;
}

export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: readonly Annotation[],
  options: RenderAnnotationsOptions = {},
): void {
  const scale = options.scale ?? 1;

  for (const a of annotations) {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = a.strokeWidth * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (a.type) {
      case "arrow":
        if (a.start && a.end) {
          drawArrow(ctx, scalePoint(a.start, scale), scalePoint(a.end, scale), a.strokeWidth * scale);
        }
        break;
      case "circle":
        if (a.center && a.radius) {
          ctx.beginPath();
          ctx.arc(a.center.x * scale, a.center.y * scale, a.radius * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case "text":
        if (a.position && a.text) {
          drawTextAnnotation(ctx, a.position, a.text, a.strokeWidth, a.color, scale);
        }
        break;
      case "freehand":
        if (a.points && a.points.length > 1) {
          drawFreehand(ctx, a.points, scale);
        }
        break;
    }
  }
}

function scalePoint(p: AnnotationPoint, s: number): AnnotationPoint {
  return { x: p.x * s, y: p.y * s };
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: AnnotationPoint,
  end: AnnotationPoint,
  lineWidth: number,
): void {
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
    end.y - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    end.x - headLen * Math.cos(angle + Math.PI / 6),
    end.y - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawTextAnnotation(
  ctx: CanvasRenderingContext2D,
  position: AnnotationPoint,
  text: string,
  strokeWidth: number,
  color: string,
  scale: number,
): void {
  const fontSize = Math.max(16, strokeWidth * 6) * scale;
  const pad = 4 * scale;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(
    position.x * scale - pad,
    position.y * scale - fontSize - pad,
    metrics.width + pad * 2,
    fontSize + pad * 2,
  );

  ctx.fillStyle = color;
  ctx.fillText(text, position.x * scale, position.y * scale);
}

function drawFreehand(
  ctx: CanvasRenderingContext2D,
  points: readonly AnnotationPoint[],
  scale: number,
): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x * scale, points[0].y * scale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * scale, points[i].y * scale);
  }
  ctx.stroke();
}
