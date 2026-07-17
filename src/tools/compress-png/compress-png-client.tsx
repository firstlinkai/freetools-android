import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
// The library's worker loads its script via importScripts from a CDN by
// default — forbidden here. Bundle the UMD build locally and point the worker
// at it so compression stays offline AND off the main thread.
import compressionLibUrl from "browser-image-compression/dist/browser-image-compression.js?url";
import { Download, Loader2, Pipette, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";

type OutputFormat = "image/png" | "image/jpeg";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Result {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

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
  if (!m) return { r: 255, g: 255, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Knock out pixels near the target color. Distance is Euclidean in RGB,
 * normalized to 0..255. Within tolerance = fully transparent; within
 * 1.25x tolerance = feathered alpha for soft edges.
 */
function knockout(data: Uint8ClampedArray, target: Rgb, tolerance: number) {
  const tol = (tolerance / 100) * 255;
  const feather = tol * 1.25;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - target.r;
    const dg = data[i + 1] - target.g;
    const db = data[i + 2] - target.b;
    const dist = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
    if (dist <= tol) {
      data[i + 3] = 0;
    } else if (feather > tol && dist <= feather) {
      const t = (dist - tol) / (feather - tol);
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
}

export function CompressPngClient() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [target, setTarget] = useState<Rgb | null>(null);
  const [tolerance, setTolerance] = useState(30);
  const [quality, setQuality] = useState(80);
  const [maxDim, setMaxDim] = useState(4096);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const origUrlRef = useRef<string | null>(null);

  // Revoke the result object URL when it changes or on unmount.
  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [result]);

  // Revoke the original-preview URL on unmount.
  useEffect(
    () => () => {
      if (origUrlRef.current) URL.revokeObjectURL(origUrlRef.current);
    },
    [],
  );

  const handleFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file is not an image. Drop a PNG, JPEG, or WebP file.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // Keep the URL alive: img.src backs the original preview in results.
      if (origUrlRef.current) URL.revokeObjectURL(origUrlRef.current);
      origUrlRef.current = url;
      // Pristine source canvas for eyedropping and processing.
      const src = document.createElement("canvas");
      src.width = img.naturalWidth;
      src.height = img.naturalHeight;
      src.getContext("2d")?.drawImage(img, 0, 0);
      sourceRef.current = src;
      setFile(f);
      setImage(img);
      setResult(null);
      setTarget(null);
      setRemoveBg(false);
      setMaxDim(
        Math.min(4096, Math.max(512, Math.max(img.naturalWidth, img.naturalHeight))),
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Live preview: original image, with knockout applied when configured.
  useEffect(() => {
    const canvas = previewRef.current;
    const src = sourceRef.current;
    if (!canvas || !src || !image) return;
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0);
    if (removeBg && target) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      knockout(imgData.data, target, tolerance);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [image, removeBg, target, tolerance]);

  // JPEG cannot hold transparency; force PNG while knockout is active.
  useEffect(() => {
    if (removeBg) setFormat("image/png");
  }, [removeBg]);

  const pickColor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!removeBg) return;
    const src = sourceRef.current;
    const canvas = previewRef.current;
    if (!src || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * src.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * src.height);
    const px = src
      .getContext("2d")
      ?.getImageData(
        Math.min(Math.max(x, 0), src.width - 1),
        Math.min(Math.max(y, 0), src.height - 1),
        1,
        1,
      ).data;
    if (px) setTarget({ r: px[0], g: px[1], b: px[2] });
  };

  const process = async () => {
    const src = sourceRef.current;
    if (!src || !file) return;
    setProcessing(true);
    setError(null);
    setResult(null);
    try {
      // Stage 1: knockout on a working canvas.
      const work = document.createElement("canvas");
      work.width = src.width;
      work.height = src.height;
      const ctx = work.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available.");
      ctx.drawImage(src, 0, 0);
      if (removeBg && target) {
        const imgData = ctx.getImageData(0, 0, work.width, work.height);
        knockout(imgData.data, target, tolerance);
        ctx.putImageData(imgData, 0, 0);
      }
      const stageBlob = await new Promise<Blob>((resolve, reject) => {
        work.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
          "image/png",
        );
      });

      // Stage 2: compression.
      const fmt: OutputFormat = removeBg ? "image/png" : format;
      const input = new File([stageBlob], "stage.png", { type: "image/png" });
      const compressed = await imageCompression(input, {
        maxWidthOrHeight: maxDim,
        initialQuality: quality / 100,
        fileType: fmt,
        useWebWorker: true,
        libURL: new URL(compressionLibUrl, window.location.href).toString(),
      });
      const url = URL.createObjectURL(compressed);
      const dims = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const probe = new Image();
          probe.onload = () =>
            resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
          probe.onerror = () => reject(new Error("Could not read the result."));
          probe.src = url;
        },
      );
      setResult({ blob: compressed, url, ...dims });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed.");
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    const ext = result.blob.type === "image/jpeg" ? "jpg" : "png";
    downloadBlob(result.blob, `${base}-compressed.${ext}`);
  };

  const reset = () => {
    setFile(null);
    setImage(null);
    setResult(null);
    setTarget(null);
    setRemoveBg(false);
    setError(null);
    sourceRef.current = null;
    if (origUrlRef.current) {
      URL.revokeObjectURL(origUrlRef.current);
      origUrlRef.current = null;
    }
  };

  if (!image || !file) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Compress it, and optionally knock a background color out to transparency."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const savings =
    result && file.size > 0
      ? Math.round(((file.size - result.blob.size) / file.size) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title={`Preview (${image.naturalWidth} x ${image.naturalHeight}px, ${formatBytes(file.size)})`}
          actions={
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              New image
            </Button>
          }
          bodyClassName="flex items-center justify-center overflow-auto"
        >
          <div
            className="inline-block max-w-full rounded border border-border"
            style={CHECKERBOARD}
          >
            <canvas
              ref={previewRef}
              onClick={pickColor}
              className={`block h-auto max-w-full ${removeBg ? "cursor-crosshair" : ""}`}
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Transparency">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={removeBg}
                  onChange={(e) => setRemoveBg(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Remove background color
              </label>
              {removeBg && (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Pipette className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Click the preview to pick the color to remove.
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-8 w-8 shrink-0 rounded-md border border-border"
                      style={{
                        backgroundColor: target ? rgbToHex(target) : "transparent",
                        ...(target ? {} : CHECKERBOARD),
                      }}
                      aria-hidden
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {target ? rgbToHex(target) : "No color picked"}
                    </span>
                    <input
                      type="color"
                      aria-label="Pick color manually"
                      value={target ? rgbToHex(target) : "#ffffff"}
                      onChange={(e) => setTarget(hexToRgb(e.target.value))}
                      className="ml-auto h-8 w-10 cursor-pointer rounded border border-input bg-card p-0.5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="knockout-tolerance">Tolerance</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {tolerance}
                      </span>
                    </div>
                    <Slider
                      id="knockout-tolerance"
                      min={0}
                      max={100}
                      step={1}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                    />
                  </div>
                </>
              )}
            </div>
          </Panel>

          <Panel title="Compression">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="compress-quality">Quality</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {quality}
                  </span>
                </div>
                <Slider
                  id="compress-quality"
                  min={10}
                  max={100}
                  step={1}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="compress-maxdim">Max dimension</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {maxDim}px
                  </span>
                </div>
                <Slider
                  id="compress-maxdim"
                  min={512}
                  max={4096}
                  step={64}
                  value={maxDim}
                  onChange={(e) => setMaxDim(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="compress-format">Output format</Label>
                <Select
                  id="compress-format"
                  value={removeBg ? "image/png" : format}
                  disabled={removeBg}
                  onChange={(e) => setFormat(e.target.value as OutputFormat)}
                >
                  <option value="image/png">PNG (keeps transparency)</option>
                  <option value="image/jpeg">JPEG (smaller, no alpha)</option>
                </Select>
                {removeBg && (
                  <p className="text-xs text-muted-foreground">
                    JPEG cannot store transparency, so PNG is used while the
                    background knockout is on.
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={process} disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Processing
                  </>
                ) : (
                  "Process image"
                )}
              </Button>
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {result && (
        <Panel title="Result">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-accent">
              {formatBytes(file.size)} to {formatBytes(result.blob.size)},{" "}
              {savings >= 0 ? `${savings}% smaller` : `${-savings}% larger`}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Original ({formatBytes(file.size)},{" "}
                  {image.naturalWidth} x {image.naturalHeight}px)
                </p>
                <div
                  className="rounded border border-border p-1"
                  style={CHECKERBOARD}
                >
                  <img
                    src={image.src}
                    alt="Original"
                    className="mx-auto max-h-64 w-auto max-w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Result ({formatBytes(result.blob.size)},{" "}
                  {result.width} x {result.height}px)
                </p>
                <div
                  className="rounded border border-border p-1"
                  style={CHECKERBOARD}
                >
                  <img
                    src={result.url}
                    alt="Compressed result"
                    className="mx-auto max-h-64 w-auto max-w-full"
                  />
                </div>
              </div>
            </div>
            <Button onClick={downloadResult}>
              <Download className="h-4 w-4" aria-hidden />
              Download
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="compress-png">
      <CompressPngClient />
    </ToolPage>
  );
}
