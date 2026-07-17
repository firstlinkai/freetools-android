import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pipette, RotateCcw } from "lucide-react";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Sample {
  rgb: Rgb;
  /** Intrinsic pixel coords the sample came from. */
  x: number;
  y: number;
}

const MAG_ZOOM = 11; // sample an 11 x 11 pixel neighborhood
const MAG_SIZE = 121; // rendered loupe size in canvas px (11px cells)
const MAX_RECENT = 10;

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function ColorPickerClient() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const displayRef = useRef<HTMLCanvasElement>(null);
  const magRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const samplingRef = useRef(false);

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
      // Pristine offscreen copy for pixel reads.
      const src = document.createElement("canvas");
      src.width = img.naturalWidth;
      src.height = img.naturalHeight;
      src.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0);
      sourceRef.current = src;
      setImage(img);
      setSample(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Paint the display canvas whenever the image changes.
  useEffect(() => {
    const canvas = displayRef.current;
    const src = sourceRef.current;
    if (!canvas || !src || !image) return;
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext("2d")?.drawImage(src, 0, 0);
  }, [image]);

  // Render the magnifier loupe for the current sample.
  useEffect(() => {
    const mag = magRef.current;
    const src = sourceRef.current;
    if (!mag || !src || !sample) return;
    const ctx = mag.getContext("2d");
    if (!ctx) return;
    const half = Math.floor(MAG_ZOOM / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE);
    ctx.drawImage(
      src,
      sample.x - half,
      sample.y - half,
      MAG_ZOOM,
      MAG_ZOOM,
      0,
      0,
      MAG_SIZE,
      MAG_SIZE,
    );
    // Outline the center pixel cell.
    const cell = MAG_SIZE / MAG_ZOOM;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(half * cell + 1, half * cell + 1, cell - 2, cell - 2);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(half * cell - 0.5, half * cell - 0.5, cell + 1, cell + 1);
  }, [sample]);

  const sampleAt = (clientX: number, clientY: number, commit: boolean) => {
    const canvas = displayRef.current;
    const src = sourceRef.current;
    if (!canvas || !src) return;
    const rect = canvas.getBoundingClientRect();
    // Map display coords back to intrinsic pixels (canvas is CSS-scaled).
    const x = Math.min(
      Math.max(Math.floor(((clientX - rect.left) / rect.width) * src.width), 0),
      src.width - 1,
    );
    const y = Math.min(
      Math.max(Math.floor(((clientY - rect.top) / rect.height) * src.height), 0),
      src.height - 1,
    );
    const px = src
      .getContext("2d", { willReadFrequently: true })
      ?.getImageData(x, y, 1, 1).data;
    if (!px) return;
    const rgb: Rgb = { r: px[0], g: px[1], b: px[2] };
    setSample({ rgb, x, y });
    if (commit) {
      const hex = rgbToHex(rgb);
      setRecent((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, MAX_RECENT));
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    samplingRef.current = true;
    sampleAt(e.clientX, e.clientY, false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!samplingRef.current) return;
    sampleAt(e.clientX, e.clientY, false);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!samplingRef.current) return;
    samplingRef.current = false;
    sampleAt(e.clientX, e.clientY, true);
  };

  const pickRecent = (hex: string) => {
    setSample((prev) => ({ rgb: hexToRgb(hex), x: prev?.x ?? 0, y: prev?.y ?? 0 }));
  };

  const reset = () => {
    setImage(null);
    setSample(null);
    setError(null);
    sourceRef.current = null;
  };

  if (!image) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Tap or drag on the photo to sample any pixel."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const hex = sample ? rgbToHex(sample.rgb) : null;
  const hsl = sample ? rgbToHsl(sample.rgb) : null;
  const rgbStr = sample ? `rgb(${sample.rgb.r}, ${sample.rgb.g}, ${sample.rgb.b})` : null;
  const hslStr = hsl ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` : null;

  return (
    <div className="space-y-4">
      <Panel
        title={`Image (${image.naturalWidth} x ${image.naturalHeight}px)`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="flex items-center justify-center overflow-auto"
      >
        <div className="inline-block max-w-full rounded border border-border" style={CHECKERBOARD}>
          <canvas
            ref={displayRef}
            className="block h-auto max-w-full cursor-crosshair touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Tap or drag to sample a pixel color"
          />
        </div>
      </Panel>

      <Panel title="Sampled color">
        {!sample ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Pipette className="h-4 w-4 shrink-0" aria-hidden />
            Tap or drag on the image to sample a pixel.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <canvas
                ref={magRef}
                width={MAG_SIZE}
                height={MAG_SIZE}
                className="h-24 w-24 shrink-0 rounded-md border border-border"
                aria-label="Magnified view around the sampled pixel"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div
                  className="h-12 w-full rounded-md border border-border"
                  style={{ backgroundColor: hex ?? undefined }}
                  aria-hidden
                />
                <p className="text-xs tabular-nums text-muted-foreground">
                  Pixel {sample.x}, {sample.y}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {[
                { label: "Hex", value: hex ?? "" },
                { label: "RGB", value: rgbStr ?? "" },
                { label: "HSL", value: hslStr ?? "" },
              ].map(({ label, value }) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">
                    <span className="mr-2 text-xs font-medium text-muted-foreground">{label}</span>
                    <span className="font-mono tabular-nums">{value}</span>
                  </span>
                  <CopyButton text={value} className="shrink-0" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {recent.length > 0 && (
        <Panel title="Recent colors">
          <div className="flex flex-wrap gap-2">
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pickRecent(c)}
                className="h-12 w-12 rounded-md border border-border transition-transform active:scale-95"
                style={{ backgroundColor: c }}
                aria-label={`Select recent color ${c}`}
                title={c}
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="color-picker">
      <ColorPickerClient />
    </ToolPage>
  );
}
