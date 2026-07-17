import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob } from "@/lib/download";

type OutputFormat = "image/png" | "image/jpeg";
type Corner = "nw" | "ne" | "sw" | "se";
type DragMode = "move" | Corner;

/** Crop rect in intrinsic image pixels. */
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RatioPreset {
  label: string;
  /** width / height; 0 = free */
  value: number;
}

const RATIOS: RatioPreset[] = [
  { label: "Free", value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

const MIN_SIZE = 16; // intrinsic px

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Largest rect of the given ratio (0 = free) centered inside W x H, at 85% scale. */
function fitCrop(W: number, H: number, ratio: number): CropRect {
  let w = W * 0.85;
  let h = H * 0.85;
  if (ratio > 0) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function CropImageClient() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("image");
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [ratio, setRatio] = useState(0);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [error, setError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);

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
      setFileName(file.name.replace(/\.[^.]+$/, "") || "image");
      setImage(img);
      setCrop(fitCrop(img.naturalWidth, img.naturalHeight, 0));
      setRatio(0);
      // The decoded <img> keeps its own bitmap; the blob URL backs img.src for
      // the on-screen preview, so it is revoked on reset/replace instead.
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  /** Map pointer client coords to intrinsic image pixel coords. */
  const toIntrinsic = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img || !image) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * image.naturalWidth, 0, image.naturalWidth),
      y: clamp(((clientY - rect.top) / rect.height) * image.naturalHeight, 0, image.naturalHeight),
    };
  };

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    const p = toIntrinsic(e.clientX, e.clientY);
    dragRef.current = { mode, startX: p.x, startY: p.y, startCrop: crop };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !image) return;
    const W = image.naturalWidth;
    const H = image.naturalHeight;
    const p = toIntrinsic(e.clientX, e.clientY);
    const c = drag.startCrop;

    if (drag.mode === "move") {
      setCrop({
        ...c,
        x: clamp(c.x + (p.x - drag.startX), 0, W - c.w),
        y: clamp(c.y + (p.y - drag.startY), 0, H - c.h),
      });
      return;
    }

    // Corner resize: the opposite corner stays anchored.
    const ax = drag.mode === "nw" || drag.mode === "sw" ? c.x + c.w : c.x;
    const ay = drag.mode === "nw" || drag.mode === "ne" ? c.y + c.h : c.y;
    const spaceX = drag.mode === "nw" || drag.mode === "sw" ? ax : W - ax;
    const spaceY = drag.mode === "nw" || drag.mode === "ne" ? ay : H - ay;

    let w = clamp(Math.abs(p.x - ax), MIN_SIZE, spaceX);
    let h = clamp(Math.abs(p.y - ay), MIN_SIZE, spaceY);
    if (ratio > 0) {
      // Follow the dominant axis, then clamp to the available space.
      if (w / ratio >= h) h = w / ratio;
      else w = h * ratio;
      if (w > spaceX) {
        w = spaceX;
        h = w / ratio;
      }
      if (h > spaceY) {
        h = spaceY;
        w = h * ratio;
      }
      w = Math.max(w, MIN_SIZE);
      h = Math.max(h, MIN_SIZE);
    }
    const x = drag.mode === "nw" || drag.mode === "sw" ? ax - w : ax;
    const y = drag.mode === "nw" || drag.mode === "ne" ? ay - h : ay;
    setCrop({ x, y, w, h });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const applyRatio = (value: number) => {
    setRatio(value);
    if (image) setCrop(fitCrop(image.naturalWidth, image.naturalHeight, value));
  };

  const exportCrop = () => {
    const img = imgRef.current;
    if (!img || !crop || !image) return;
    const sx = Math.round(crop.x);
    const sy = Math.round(crop.y);
    const sw = Math.max(1, Math.round(crop.w));
    const sh = Math.max(1, Math.round(crop.h));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (format === "image/jpeg") {
      // JPEG has no alpha; composite over white instead of black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sw, sh);
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob(
      (blob) => {
        if (blob)
          downloadBlob(blob, `${fileName}-cropped.${format === "image/jpeg" ? "jpg" : "png"}`);
      },
      format,
      0.92,
    );
  };

  const reset = () => {
    if (image) URL.revokeObjectURL(image.src);
    setImage(null);
    setCrop(null);
    setError(null);
  };

  if (!image || !crop) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Drag the box and its corner handles to frame your crop."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const W = image.naturalWidth;
  const H = image.naturalHeight;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const corners: { corner: Corner; className: string }[] = [
    { corner: "nw", className: "left-0 top-0" },
    { corner: "ne", className: "right-0 top-0" },
    { corner: "sw", className: "bottom-0 left-0" },
    { corner: "se", className: "bottom-0 right-0" },
  ];
  const cornerTranslate: Record<Corner, string> = {
    nw: "-translate-x-1/2 -translate-y-1/2",
    ne: "translate-x-1/2 -translate-y-1/2",
    sw: "-translate-x-1/2 translate-y-1/2",
    se: "translate-x-1/2 translate-y-1/2",
  };

  return (
    <div className="space-y-4">
      <Panel
        title={`Crop (${Math.round(crop.w)} x ${Math.round(crop.h)}px of ${W} x ${H}px)`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="flex items-center justify-center overflow-auto"
      >
        <div
          ref={containerRef}
          className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded border border-border"
          style={CHECKERBOARD}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            ref={imgRef}
            src={image.src}
            alt="Image to crop"
            draggable={false}
            className="block h-auto max-w-full"
          />
          <div
            className="absolute cursor-move border-2 border-accent"
            style={{
              left: pct(crop.x, W),
              top: pct(crop.y, H),
              width: pct(crop.w, W),
              height: pct(crop.h, H),
              boxShadow: "0 0 0 100000px rgba(0, 0, 0, 0.55)",
            }}
            onPointerDown={(e) => beginDrag(e, "move")}
            aria-label="Crop region. Drag to move."
          >
            {/* Rule-of-thirds guides */}
            <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/25" />
            {corners.map(({ corner, className }) => (
              <div
                key={corner}
                // 48x48px touch target centered on the corner; small visible knob.
                className={`absolute flex h-12 w-12 items-center justify-center ${className} ${cornerTranslate[corner]}`}
                style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }}
                onPointerDown={(e) => beginDrag(e, corner)}
                aria-label={`Resize crop from ${corner} corner`}
              >
                <span className="h-4 w-4 rounded-full border-2 border-accent bg-background" />
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Options">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Aspect ratio</Label>
            <div className="grid grid-cols-4 gap-2">
              {RATIOS.map((r) => (
                <Button
                  key={r.label}
                  variant={ratio === r.value ? "primary" : "secondary"}
                  size="md"
                  className="w-full"
                  onClick={() => applyRatio(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crop-format">Output format</Label>
            <Select
              id="crop-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
            >
              <option value="image/png">PNG (keeps transparency)</option>
              <option value="image/jpeg">JPEG (smaller, no alpha)</option>
            </Select>
          </div>
          <Button className="w-full" onClick={exportCrop}>
            <Download className="h-4 w-4" aria-hidden />
            Download crop
          </Button>
          <p className="truncate text-center text-xs text-muted-foreground">
            {fileName}-cropped.{format === "image/jpeg" ? "jpg" : "png"}
          </p>
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="crop-image">
      <CropImageClient />
    </ToolPage>
  );
}
