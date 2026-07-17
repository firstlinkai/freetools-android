import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadBlob } from "@/lib/download";

type RedactMode = "blur" | "pixelate" | "black";

interface Region {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  mode: RedactMode;
  intensity: number;
}

const MODE_LABELS: Record<RedactMode, string> = {
  blur: "Blur",
  pixelate: "Pixelate",
  black: "Black box",
};

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

/** Apply one redaction region onto the working canvas. */
function applyRegion(canvas: HTMLCanvasElement, region: Region) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const x = Math.round(region.x);
  const y = Math.round(region.y);
  const w = Math.max(1, Math.round(region.w));
  const h = Math.max(1, Math.round(region.h));

  if (region.mode === "black") {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(x, y, w, h);
    return;
  }

  if (region.mode === "pixelate") {
    const px = Math.max(2, Math.round(region.intensity));
    const tw = Math.max(1, Math.ceil(w / px));
    const th = Math.max(1, Math.ceil(h / px));
    const tiny = document.createElement("canvas");
    tiny.width = tw;
    tiny.height = th;
    const tctx = tiny.getContext("2d");
    if (!tctx) return;
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(canvas, x, y, w, h, 0, 0, tw, th);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, tw, th, x, y, w, h);
    ctx.restore();
    return;
  }

  // Blur: over-crop with padding so the blur samples enough context,
  // then clip the paste back to the exact region to avoid edge bleed.
  const radius = Math.max(2, Math.round(region.intensity));
  const pad = radius * 2;
  const sx = Math.max(0, x - pad);
  const sy = Math.max(0, y - pad);
  const sw = Math.min(canvas.width, x + w + pad) - sx;
  const sh = Math.min(canvas.height, y + h + pad) - sy;
  if (sw <= 0 || sh <= 0) return;
  const temp = document.createElement("canvas");
  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext("2d");
  if (!tctx) return;
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(temp, sx, sy);
  ctx.restore();
}

export function BlurImageClient() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("image");
  const [regions, setRegions] = useState<Region[]>([]);
  const [mode, setMode] = useState<RedactMode>("blur");
  const [intensity, setIntensity] = useState(12);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });
  const nextIdRef = useRef(1);

  const handleFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image. Drop a PNG, JPEG, or WebP file.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setFileName(file.name.replace(/\.[^.]+$/, "") || "image");
      setRegions([]);
      setImage(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Repaint: original image, then every region in creation order.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    if (overlay) {
      overlay.width = image.naturalWidth;
      overlay.height = image.naturalHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const region of regions) applyRegion(canvas, region);
  }, [image, regions]);

  /** Map pointer client coords to intrinsic canvas pixel coords. */
  const toCanvasCoords = (e: React.PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: Math.min(Math.max(x, 0), canvas.width),
      y: Math.min(Math.max(y, 0), canvas.height),
    };
  };

  const accentColor = () => {
    if (typeof window === "undefined") return "#6366f1";
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    return v || "#6366f1";
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current;
    if (!overlay || !image) return;
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    const p = toCanvasCoords(e, overlay);
    dragRef.current = { startX: p.x, startY: p.y, active: true };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current;
    if (!overlay || !dragRef.current.active) return;
    const p = toCanvasCoords(e, overlay);
    const { startX, startY } = dragRef.current;
    const octx = overlay.getContext("2d");
    if (!octx) return;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const scale = overlay.width / overlay.getBoundingClientRect().width;
    octx.strokeStyle = accentColor();
    octx.lineWidth = Math.max(1.5, 1.5 * scale);
    octx.setLineDash([6 * scale, 4 * scale]);
    octx.strokeRect(
      Math.min(startX, p.x),
      Math.min(startY, p.y),
      Math.abs(p.x - startX),
      Math.abs(p.y - startY),
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current;
    if (!overlay || !dragRef.current.active) return;
    dragRef.current.active = false;
    const octx = overlay.getContext("2d");
    octx?.clearRect(0, 0, overlay.width, overlay.height);
    const p = toCanvasCoords(e, overlay);
    const { startX, startY } = dragRef.current;
    const x = Math.min(startX, p.x);
    const y = Math.min(startY, p.y);
    const w = Math.abs(p.x - startX);
    const h = Math.abs(p.y - startY);
    if (w < 3 || h < 3) return; // ignore accidental taps
    setRegions((prev) => [
      ...prev,
      { id: nextIdRef.current++, x, y, w, h, mode, intensity },
    ]);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${fileName}-redacted.png`);
    }, "image/png");
  };

  const reset = () => {
    setImage(null);
    setRegions([]);
    setError(null);
  };

  if (!image) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Then drag boxes over anything you want hidden."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Panel
        title="Canvas"
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="flex items-center justify-center overflow-auto"
      >
        <div className="relative inline-block max-w-full rounded border border-border" style={CHECKERBOARD}>
          <canvas ref={canvasRef} className="block h-auto max-w-full" />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 h-full w-full cursor-crosshair"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Drag to draw a redaction box"
          />
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="Redaction">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="redact-mode">Mode</Label>
              <Select
                id="redact-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as RedactMode)}
              >
                <option value="blur">Blur (strong)</option>
                <option value="pixelate">Pixelate</option>
                <option value="black">Black box</option>
              </Select>
            </div>
            {mode !== "black" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="redact-intensity">
                    {mode === "blur" ? "Blur radius" : "Pixel size"}
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {intensity}px
                  </span>
                </div>
                <Slider
                  id="redact-intensity"
                  min={2}
                  max={mode === "blur" ? 40 : 64}
                  step={1}
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                />
              </div>
            )}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              New boxes use the current mode. Existing boxes keep the settings
              they were drawn with.
            </p>
          </div>
        </Panel>

        <Panel
          title={`Regions (${regions.length})`}
          actions={
            regions.length > 0 ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRegions((prev) => prev.slice(0, -1))}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  Undo last
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRegions([])}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Clear all
                </Button>
              </>
            ) : undefined
          }
          bodyClassName="p-2"
        >
          {regions.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Drag on the image to draw a box. It is redacted the moment you
              release.
            </p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {regions.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-xs text-foreground">
                    <span className="font-medium">{i + 1}.</span>{" "}
                    {MODE_LABELS[r.mode]}
                    {r.mode !== "black" ? ` ${r.intensity}px` : ""}
                    <span className="text-muted-foreground">
                      {" "}
                      {Math.round(r.w)} x {Math.round(r.h)}px
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={`Delete region ${i + 1}`}
                    onClick={() =>
                      setRegions((prev) => prev.filter((x) => x.id !== r.id))
                    }
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Export">
          <div className="space-y-2">
            <Button className="w-full" onClick={exportPng} disabled={regions.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              Download PNG
            </Button>
            <p className="truncate text-center text-xs text-muted-foreground">
              {fileName}-redacted.png
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="blur-image">
      <BlurImageClient />
    </ToolPage>
  );
}
