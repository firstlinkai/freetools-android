import { useCallback, useEffect, useRef, useState } from "react";
import { parseGIF, decompressFrames } from "gifuct-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { Download, Info, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToolPage } from "@/components/tool/tool-page";
import { downloadBlob, formatBytes } from "@/lib/download";

interface DecodedGif {
  width: number;
  height: number;
  frames: ImageData[];
  delays: number[]; // normalized original delays, ms
}

interface Progress {
  done: number;
  total: number;
}

type Phase = "empty" | "decoding" | "ready" | "encoding";

const SPEED_CHIPS = [0.5, 1, 1.5, 2, 3];
const MIN_DELAY = 20; // browsers clamp GIF frame delays below ~20 ms

/** Browsers treat tiny/zero GIF delays as 100 ms; mirror that here. */
function normalizeDelay(delay: number): number {
  return delay && delay > 10 ? delay : 100;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function isGif(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 6).arrayBuffer());
  const sig = String.fromCharCode(...head);
  return sig === "GIF87a" || sig === "GIF89a";
}

export function GifSpeedClient() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<DecodedGif | null>(null);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 });
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);

  const originalUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    originalUrlRef.current = originalUrl;
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    };
  }, [originalUrl]);

  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [result]);

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setDecoded(null);
    try {
      if (!(await isGif(f))) {
        setError("That file is not a GIF (missing GIF87a/GIF89a signature).");
        return;
      }
      setPhase("decoding");
      setFile(f);
      setOriginalUrl(URL.createObjectURL(f));

      const gif = parseGIF(await f.arrayBuffer());
      const rawFrames = decompressFrames(gif, true);
      if (rawFrames.length === 0) throw new Error("No frames found in this GIF.");
      const width = gif.lsd.width;
      const height = gif.lsd.height;
      setProgress({ done: 0, total: rawFrames.length });

      // Composite patches into full-size frames, honoring dims offsets
      // and disposal (2 = restore to background, 3 = restore to previous).
      const work = document.createElement("canvas");
      work.width = width;
      work.height = height;
      const ctx = work.getContext("2d", { willReadFrequently: true });
      const patchCanvas = document.createElement("canvas");
      const pctx = patchCanvas.getContext("2d");
      if (!ctx || !pctx) throw new Error("Canvas is not available.");

      const frames: ImageData[] = [];
      const delays: number[] = [];
      for (let i = 0; i < rawFrames.length; i++) {
        const frame = rawFrames[i];
        const { dims } = frame;
        let before: ImageData | null = null;
        if (frame.disposalType === 3) before = ctx.getImageData(0, 0, width, height);

        patchCanvas.width = dims.width;
        patchCanvas.height = dims.height;
        pctx.putImageData(
          new ImageData(new Uint8ClampedArray(frame.patch), dims.width, dims.height),
          0,
          0,
        );
        ctx.drawImage(patchCanvas, dims.left, dims.top);

        frames.push(ctx.getImageData(0, 0, width, height));
        delays.push(normalizeDelay(frame.delay));

        if (frame.disposalType === 2) {
          ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
        } else if (frame.disposalType === 3 && before) {
          ctx.putImageData(before, 0, 0);
        }

        if (i % 5 === 4 || i === rawFrames.length - 1) {
          setProgress({ done: i + 1, total: rawFrames.length });
          await new Promise(requestAnimationFrame);
        }
      }

      setDecoded({ width, height, frames, delays });
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decode this GIF.");
      setPhase("empty");
      setFile(null);
      setOriginalUrl(null);
    }
  }, []);

  const render = async () => {
    if (!decoded || !file) return;
    setPhase("encoding");
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: decoded.frames.length });
    try {
      const enc = GIFEncoder();
      for (let i = 0; i < decoded.frames.length; i++) {
        const { data } = decoded.frames[i];
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        const delay = Math.max(MIN_DELAY, Math.round(decoded.delays[i] / speed));
        enc.writeFrame(index, decoded.width, decoded.height, { palette, delay });
        if (i % 3 === 2 || i === decoded.frames.length - 1) {
          setProgress({ done: i + 1, total: decoded.frames.length });
          await new Promise(requestAnimationFrame);
        }
      }
      enc.finish();
      const blob = new Blob([enc.bytes()], { type: "image/gif" });
      setResult({ blob, url: URL.createObjectURL(blob) });
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Encoding failed.");
      setPhase("ready");
    }
  };

  const downloadResult = () => {
    if (!result || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "") || "animation";
    downloadBlob(result.blob, `${base}-${speed}x.gif`);
  };

  const reset = () => {
    setPhase("empty");
    setError(null);
    setFile(null);
    setOriginalUrl(null);
    setDecoded(null);
    setResult(null);
    setSpeed(1);
  };

  if (phase === "empty") {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/gif"
          onFiles={handleFiles}
          hint="Animated GIF only. Speed it up or slow it down from 0.25x to 4x."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (phase === "decoding" || !decoded || !file) {
    return (
      <Panel title="Decoding">
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Decoding frame {progress.done} of {progress.total || "?"}
          </p>
          {progress.total > 0 && (
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      </Panel>
    );
  }

  const originalDuration = decoded.delays.reduce((a, b) => a + b, 0);
  const newDelays = decoded.delays.map((d) =>
    Math.max(MIN_DELAY, Math.round(d / speed)),
  );
  const newDuration = newDelays.reduce((a, b) => a + b, 0);
  const clampedCount = decoded.delays.filter(
    (d) => Math.round(d / speed) < MIN_DELAY,
  ).length;
  const encoding = phase === "encoding";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Original"
        actions={
          <Button variant="ghost" size="sm" onClick={reset} disabled={encoding}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New GIF
          </Button>
        }
      >
        <div className="space-y-3">
          {originalUrl && (
            <img
              src={originalUrl}
              alt="Original GIF"
              className="mx-auto max-h-80 w-auto max-w-full rounded border border-border"
            />
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-medium text-foreground">{formatBytes(file.size)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dimensions</dt>
              <dd className="font-medium text-foreground">
                {decoded.width} x {decoded.height}px
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Frames</dt>
              <dd className="font-medium text-foreground">{decoded.frames.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="font-medium text-foreground">
                {formatDuration(originalDuration)}
              </dd>
            </div>
          </dl>
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="Speed">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="gif-speed">Playback speed</Label>
                <span className="text-sm font-semibold tabular-nums text-accent">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <Slider
                id="gif-speed"
                min={0.25}
                max={4}
                step={0.05}
                value={speed}
                disabled={encoding}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SPEED_CHIPS.map((s) => (
                <Button
                  key={s}
                  variant={speed === s ? "secondary" : "outline"}
                  size="sm"
                  disabled={encoding}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              New duration:{" "}
              <span className="font-medium text-foreground">
                {formatDuration(newDuration)}
              </span>{" "}
              (was {formatDuration(originalDuration)})
            </p>
            {clampedCount > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {clampedCount} of {decoded.frames.length} frames hit the 20 ms
                minimum delay browsers allow, so playback may be slower than the
                slider suggests.
              </p>
            )}
            <Button className="w-full" onClick={render} disabled={encoding}>
              {encoding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Encoding
                </>
              ) : (
                "Render GIF"
              )}
            </Button>
            {encoding && (
              <div className="space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-accent transition-[width]"
                    style={{
                      width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Encoding frame {progress.done} of {progress.total}
                </p>
              </div>
            )}
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </Panel>

        {result && (
          <Panel title="Result">
            <div className="space-y-3">
              <img
                src={result.url}
                alt="Re-timed GIF"
                className="mx-auto max-h-80 w-auto max-w-full rounded border border-border"
              />
              <p className="text-sm font-semibold text-accent">
                {formatBytes(file.size)} to {formatBytes(result.blob.size)} at{" "}
                {speed.toFixed(2)}x
              </p>
              <Button onClick={downloadResult}>
                <Download className="h-4 w-4" aria-hidden />
                Download
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="gif-speed">
      <GifSpeedClient />
    </ToolPage>
  );
}
