import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { downloadDataUrl, formatBytes } from "@/lib/download";

interface Source {
  file: File;
  img: HTMLImageElement;
  url: string; // object URL backing the original preview
}

interface Compressed {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
}

/** Byte length of a base64 data URL without decoding it. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function CompressImageSizeClient() {
  const [source, setSource] = useState<Source | null>(null);
  const [quality, setQuality] = useState(70);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [result, setResult] = useState<Compressed | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Offscreen canvas reused for every re-encode.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const handleFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file isn't an image. Drop a PNG, JPG, or WebP file.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      // Default the width cap to the native width (never upscale by default).
      setMaxWidth(img.naturalWidth);
      setResult(null);
      setSource({ file: f, img, url });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Live re-encode whenever the image, quality, or width cap changes.
  useEffect(() => {
    if (!source) return;
    const { img } = source;
    const cap = Math.max(16, Math.min(maxWidth || img.naturalWidth, 10000));
    // Preserve aspect ratio; never upscale beyond the source resolution.
    const scale = Math.min(1, cap / img.naturalWidth);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const timer = setTimeout(() => {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Canvas is unavailable in this browser.");
        return;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality / 100);
      setResult({ dataUrl, bytes: dataUrlBytes(dataUrl), width, height });
    }, 120);

    return () => clearTimeout(timer);
  }, [source, quality, maxWidth]);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSource(null);
    setResult(null);
    setError(null);
  }, []);

  const download = useCallback(() => {
    if (!result || !source) return;
    const base = source.file.name.replace(/\.[^.]+$/, "") || "image";
    downloadDataUrl(result.dataUrl, `${base}-compressed.jpg`);
  }, [result, source]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/png,image/jpeg,image/webp"
          onFiles={handleFiles}
          hint="PNG, JPG, or WebP. Compress it with a live quality preview."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const original = source.file.size;
  const saved =
    result && original > 0
      ? Math.round(((original - result.bytes) / original) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Panel
        title="Compression settings"
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="p-4"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="quality">Target quality</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {quality}%
              </span>
            </div>
            <Slider
              id="quality"
              min={10}
              max={100}
              step={1}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-width">Max width scaling (pixels)</Label>
            <Input
              id="max-width"
              type="number"
              min={16}
              max={10000}
              step={1}
              value={maxWidth}
              onChange={(e) => setMaxWidth(Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground">
              Source is {source.img.naturalWidth}×{source.img.naturalHeight}px.
              Images are never upscaled.
            </p>
          </div>
        </div>
      </Panel>

      {/* Live size counter */}
      {result && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Original
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatBytes(original)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Compressed
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatBytes(result.bytes)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Disk saved
            </p>
            <p
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                saved >= 0 ? "text-accent" : "text-danger"
              }`}
            >
              {saved >= 0 ? `${saved}%` : `+${-saved}%`}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({formatBytes(Math.abs(original - result.bytes))})
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Side-by-side workspace */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title={`Original · ${source.img.naturalWidth}×${source.img.naturalHeight}px`}
          bodyClassName="flex items-center justify-center overflow-auto bg-muted/30 p-3"
        >
          <img
            src={source.url}
            alt="Original"
            className="mx-auto max-h-[420px] w-auto max-w-full rounded border border-border"
          />
        </Panel>
        <Panel
          title={
            result
              ? `Compressed · ${result.width}×${result.height}px · JPEG ${quality}%`
              : "Compressed"
          }
          bodyClassName="flex items-center justify-center overflow-auto bg-muted/30 p-3"
        >
          {result ? (
            <img
              src={result.dataUrl}
              alt="Compressed preview"
              className="mx-auto max-h-[420px] w-auto max-w-full rounded border border-border"
            />
          ) : (
            <span className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
              <ImageIcon className="h-6 w-6" aria-hidden />
              Rendering preview…
            </span>
          )}
        </Panel>
      </div>

      <Button onClick={download} disabled={!result}>
        <Download className="h-4 w-4" aria-hidden />
        Download compressed image
      </Button>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="compress-image-size">
      <CompressImageSizeClient />
    </ToolPage>
  );
}
