import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadBlob } from "@/lib/download";

type OutputFormat = "image/png" | "image/jpeg";

/** Longest edge of the fast on-screen preview. Full res is used on save. */
const PREVIEW_MAX = 896;

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

/**
 * 3x3 sharpen for rows [y0, y1): identity blended with a Laplacian kernel.
 * out = src + amount * (4*src - up - down - left - right); edges clamp.
 * amount 0 = untouched, 1 = the classic [0,-1,0; -1,5,-1; 0,-1,0] kernel.
 * Uint8ClampedArray clamps writes to 0..255 for free. Alpha passes through.
 */
function sharpenRows(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number,
  y0: number,
  y1: number,
) {
  for (let y = y0; y < y1; y++) {
    const up = y > 0 ? y - 1 : 0;
    const down = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const left = x > 0 ? x - 1 : 0;
      const right = x < w - 1 ? x + 1 : x;
      const i = (y * w + x) * 4;
      const iu = (up * w + x) * 4;
      const id = (down * w + x) * 4;
      const il = (y * w + left) * 4;
      const ir = (y * w + right) * 4;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c];
        dst[i + c] =
          v + amount * (4 * v - src[iu + c] - src[id + c] - src[il + c] - src[ir + c]);
      }
      dst[i + 3] = src[i + 3];
    }
  }
}

export function SharpenImageClient() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("image");
  const [strength, setStrength] = useState(50);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  /** Downscaled source pixels for instant slider feedback (small, kept). */
  const previewSrcRef = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  /** Full-resolution original, read lazily at save time. */
  const fullSrcRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Bumped on reset/replace to cancel an in-flight full-res pass. */
  const generationRef = useRef(0);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      generationRef.current++;
    },
    [],
  );

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
      // Full-res canvas for the save-time pass.
      const full = document.createElement("canvas");
      full.width = img.naturalWidth;
      full.height = img.naturalHeight;
      full.getContext("2d")?.drawImage(img, 0, 0);
      fullSrcRef.current = full;
      // Downscaled copy that the strength slider previews against.
      const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const pw = Math.max(1, Math.round(img.naturalWidth * scale));
      const ph = Math.max(1, Math.round(img.naturalHeight * scale));
      const small = document.createElement("canvas");
      small.width = pw;
      small.height = ph;
      const sctx = small.getContext("2d");
      if (!sctx) {
        setError("Canvas is not available.");
        return;
      }
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(img, 0, 0, pw, ph);
      const data = sctx.getImageData(0, 0, pw, ph);
      previewSrcRef.current = { data: data.data, w: pw, h: ph };
      setFileName(file.name.replace(/\.[^.]+$/, "") || "image");
      setImage(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Repaint the preview on load and on strength change, debounced to one
  // requestAnimationFrame so dragging the slider never queues stale work.
  useEffect(() => {
    if (!image) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = previewCanvasRef.current;
      const src = previewSrcRef.current;
      if (!canvas || !src) return;
      canvas.width = src.w;
      canvas.height = src.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const out = ctx.createImageData(src.w, src.h);
      sharpenRows(src.data, out.data, src.w, src.h, strength / 100, 0, src.h);
      ctx.putImageData(out, 0, 0);
    });
  }, [image, strength]);

  const save = async () => {
    const full = fullSrcRef.current;
    if (!full || processing) return;
    const generation = ++generationRef.current;
    setProcessing(true);
    setProgress(0);
    setError(null);
    try {
      const w = full.width;
      const h = full.height;
      const ctx = full.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available.");
      let srcData: ImageData | null = ctx.getImageData(0, 0, w, h);
      let dst: Uint8ClampedArray<ArrayBuffer> | null = new Uint8ClampedArray(
        srcData.data.length,
      );
      const amount = strength / 100;
      // Chunk by rows (~250k px per slice) and yield a frame between slices
      // so large photos never freeze the UI.
      const rowsPerChunk = Math.max(8, Math.floor(250000 / w));
      for (let y = 0; y < h; y += rowsPerChunk) {
        sharpenRows(srcData.data, dst, w, h, amount, y, Math.min(h, y + rowsPerChunk));
        setProgress(Math.round((Math.min(h, y + rowsPerChunk) / h) * 100));
        await new Promise<number>((r) => requestAnimationFrame(r));
        if (generationRef.current !== generation) return; // cancelled
      }
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const octx = out.getContext("2d");
      if (!octx) throw new Error("Canvas is not available.");
      octx.putImageData(new ImageData(dst, w, h), 0, 0);
      srcData = null; // release the large buffers
      dst = null;
      if (format === "image/jpeg") {
        // JPEG has no alpha; composite over white behind the pixels.
        octx.globalCompositeOperation = "destination-over";
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, w, h);
        octx.globalCompositeOperation = "source-over";
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
          format,
          0.92,
        );
      });
      if (generationRef.current !== generation) return;
      downloadBlob(blob, `${fileName}-sharpened.${format === "image/jpeg" ? "jpg" : "png"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sharpening failed.");
    } finally {
      if (generationRef.current === generation) setProcessing(false);
    }
  };

  const reset = () => {
    generationRef.current++;
    setImage(null);
    setError(null);
    setProcessing(false);
    previewSrcRef.current = null;
    fullSrcRef.current = null;
  };

  if (!image) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Slide the strength to bring out edge detail."
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
        title={`Preview (${image.naturalWidth} x ${image.naturalHeight}px)`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="flex flex-col items-center gap-2 overflow-auto"
      >
        <div className="inline-block max-w-full rounded border border-border" style={CHECKERBOARD}>
          <canvas ref={previewCanvasRef} className="block h-auto max-w-full" />
        </div>
        {Math.max(image.naturalWidth, image.naturalHeight) > PREVIEW_MAX && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            The preview is downscaled for speed. Saving processes the photo at full
            resolution.
          </p>
        )}
      </Panel>

      <Panel title="Sharpen">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sharpen-strength">Strength</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{strength}</span>
            </div>
            <Slider
              id="sharpen-strength"
              min={0}
              max={100}
              step={1}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sharpen-format">Format</Label>
            <Select
              id="sharpen-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
            >
              <option value="image/png">PNG (keeps transparency)</option>
              <option value="image/jpeg">JPEG (smaller, no alpha)</option>
            </Select>
          </div>
          <Button className="w-full" onClick={() => void save()} disabled={processing}>
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sharpening… {progress}%
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden />
                Sharpen & download
              </>
            )}
          </Button>
          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <p className="truncate text-center text-xs text-muted-foreground">
            {fileName}-sharpened.{format === "image/jpeg" ? "jpg" : "png"}
          </p>
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="sharpen-image">
      <SharpenImageClient />
    </ToolPage>
  );
}
