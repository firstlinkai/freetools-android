import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Link2, Link2Off, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";

type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

interface Result {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const MAX_DIM = 10000;

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

const EXT: Record<OutputFormat, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const clampDim = (v: number) => Math.min(Math.max(Math.round(v), 1), MAX_DIM);

/**
 * High-quality resize. Prefers createImageBitmap with resizeQuality "high";
 * falls back to stepped halving (repeated 50% downscales) which avoids the
 * aliasing a single big drawImage downscale produces.
 */
async function resizeToCanvas(
  image: HTMLImageElement,
  targetW: number,
  targetH: number,
): Promise<HTMLCanvasElement> {
  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  try {
    const bitmap = await createImageBitmap(image, {
      resizeWidth: targetW,
      resizeHeight: targetH,
      resizeQuality: "high",
    });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return out;
  } catch {
    // Fall through to stepped halving below.
  }

  let src: HTMLCanvasElement | HTMLImageElement = image;
  let cw = image.naturalWidth;
  let ch = image.naturalHeight;
  while (cw / 2 > targetW && ch / 2 > targetH) {
    cw = Math.max(targetW, Math.floor(cw / 2));
    ch = Math.max(targetH, Math.floor(ch / 2));
    const step = document.createElement("canvas");
    step.width = cw;
    step.height = ch;
    const sctx = step.getContext("2d");
    if (!sctx) throw new Error("Canvas is not available.");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src, 0, 0, cw, ch);
    src = step;
  }
  ctx.drawImage(src, 0, 0, cw, ch, 0, 0, targetW, targetH);
  return out;
}

export function ResizeImageClient() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [widthStr, setWidthStr] = useState("");
  const [heightStr, setHeightStr] = useState("");
  const [locked, setLocked] = useState(true);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [quality, setQuality] = useState(90);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultUrlRef = useRef<string | null>(null);

  // Revoke the result object URL when it changes or on unmount.
  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [result]);

  // Revoke the source preview URL on unmount/replace.
  useEffect(() => {
    const src = image?.src;
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [image]);

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
      setFile(f);
      setImage(img);
      setResult(null);
      setWidthStr(String(img.naturalWidth));
      setHeightStr(String(img.naturalHeight));
      if (f.type === "image/jpeg") setFormat("image/jpeg");
      else if (f.type === "image/webp") setFormat("image/webp");
      else setFormat("image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  const aspect = image ? image.naturalWidth / image.naturalHeight : 1;

  const onWidthChange = (raw: string) => {
    setWidthStr(raw);
    if (!locked) return;
    const w = parseInt(raw, 10);
    if (Number.isFinite(w) && w > 0) setHeightStr(String(clampDim(w / aspect)));
  };

  const onHeightChange = (raw: string) => {
    setHeightStr(raw);
    if (!locked) return;
    const h = parseInt(raw, 10);
    if (Number.isFinite(h) && h > 0) setWidthStr(String(clampDim(h * aspect)));
  };

  const applyPercent = (pct: number) => {
    if (!image) return;
    setWidthStr(String(clampDim((image.naturalWidth * pct) / 100)));
    setHeightStr(String(clampDim((image.naturalHeight * pct) / 100)));
  };

  const process = async () => {
    if (!image || !file) return;
    const w = parseInt(widthStr, 10);
    const h = parseInt(heightStr, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
      setError("Enter a valid width and height (1px or more).");
      return;
    }
    if (w > MAX_DIM || h > MAX_DIM) {
      setError(`Maximum dimension is ${MAX_DIM}px.`);
      return;
    }
    setProcessing(true);
    setError(null);
    setResult(null);
    try {
      const canvas = await resizeToCanvas(image, w, h);
      if (format === "image/jpeg") {
        // JPEG has no alpha; composite over white so transparency does not
        // turn black. Redraw under the existing pixels.
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = "source-over";
        }
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
          format,
          quality / 100,
        );
      });
      setResult({ blob, url: URL.createObjectURL(blob), width: w, height: h });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resize failed.");
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    downloadBlob(result.blob, `${base}-${result.width}x${result.height}.${EXT[format]}`);
  };

  const reset = () => {
    setFile(null);
    setImage(null);
    setResult(null);
    setError(null);
  };

  if (!image || !file) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Set exact dimensions or scale by percentage."
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
    <div className="space-y-4">
      <Panel
        title={`Original (${image.naturalWidth} x ${image.naturalHeight}px, ${formatBytes(file.size)})`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="flex items-center justify-center overflow-auto"
      >
        <div className="inline-block max-w-full rounded border border-border" style={CHECKERBOARD}>
          <img src={image.src} alt="Original" className="block h-auto max-h-72 w-auto max-w-full" />
        </div>
      </Panel>

      <Panel title="Dimensions">
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="resize-width">Width (px)</Label>
              <Input
                id="resize-width"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DIM}
                value={widthStr}
                onChange={(e) => onWidthChange(e.target.value)}
              />
            </div>
            <Button
              variant={locked ? "primary" : "outline"}
              size="icon"
              className="h-12 w-12 shrink-0"
              aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              aria-pressed={locked}
              onClick={() => setLocked((v) => !v)}
            >
              {locked ? (
                <Link2 className="h-4 w-4" aria-hidden />
              ) : (
                <Link2Off className="h-4 w-4" aria-hidden />
              )}
            </Button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="resize-height">Height (px)</Label>
              <Input
                id="resize-height"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DIM}
                value={heightStr}
                onChange={(e) => onHeightChange(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Scale presets</Label>
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant="secondary"
                  size="md"
                  className="w-full"
                  onClick={() => applyPercent(pct)}
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Output">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="resize-format">Format</Label>
            <Select
              id="resize-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
            >
              <option value="image/png">PNG (lossless, keeps transparency)</option>
              <option value="image/jpeg">JPEG (small, no alpha)</option>
              <option value="image/webp">WebP (small, keeps transparency)</option>
            </Select>
          </div>
          {format !== "image/png" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="resize-quality">Quality</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{quality}</span>
              </div>
              <Slider
                id="resize-quality"
                min={40}
                max={100}
                step={1}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </div>
          )}
          <Button className="w-full" onClick={process} disabled={processing}>
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Resizing
              </>
            ) : (
              "Resize image"
            )}
          </Button>
          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Panel>

      {result && (
        <Panel title="Result">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-accent">
              {image.naturalWidth} x {image.naturalHeight}px to {result.width} x {result.height}
              px, {formatBytes(file.size)} to {formatBytes(result.blob.size)}
            </p>
            <div className="rounded border border-border p-1" style={CHECKERBOARD}>
              <img
                src={result.url}
                alt="Resized result"
                className="mx-auto max-h-72 w-auto max-w-full"
              />
            </div>
            <Button className="w-full" onClick={downloadResult}>
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
    <ToolPage slug="resize-image">
      <ResizeImageClient />
    </ToolPage>
  );
}
