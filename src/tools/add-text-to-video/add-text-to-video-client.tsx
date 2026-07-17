import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Type, Video, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToolPage } from "@/components/tool/tool-page";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

type VPos = "top" | "middle" | "bottom";

function ext(file: File, fallback: string): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? fallback;
}

/** Draw the caption onto ctx sized to (w, h). Font size is a fraction (0..1) of height. */
function drawText(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  vpos: VPos,
  sizeFrac: number,
  color: string,
) {
  const fontPx = Math.max(8, Math.round(h * sizeFrac));
  ctx.clearRect(0, 0, w, h);
  ctx.font = `bold ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const margin = Math.round(h * 0.06) + fontPx / 2;
  const y = vpos === "top" ? margin : vpos === "bottom" ? h - margin : h / 2;
  const x = w / 2;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(2, fontPx / 6);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function AddTextToVideoClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();
  const [video, setVideo] = useState<File | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [text, setText] = useState("Your caption");
  const [vpos, setVpos] = useState<VPos>("bottom");
  const [sizePct, setSizePct] = useState(8); // % of video height
  const [color, setColor] = useState("#ffffff");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(
    () => () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  // Live styling preview (fixed 16:9 canvas — just illustrates styling).
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(120,120,130,0.25)";
    ctx.fillRect(0, 0, w, h);
    if (text) drawText(ctx, w, h, text, vpos, sizePct / 100, color);
  }, [text, vpos, sizePct, color, dims]);

  const pickVideo = useCallback(
    (f: File[]) => {
      if (!f[0]) return;
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = null;
      }
      setResult(null);
      setError(null);
      setDims(null);
      setVideo(f[0]);
      const url = URL.createObjectURL(f[0]);
      videoUrlRef.current = url;
      setVideoUrl(url);
      void ensureLoaded().catch(() => {});
    },
    [ensureLoaded],
  );

  const run = useCallback(async () => {
    if (!video || !dims || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);

    const vName = `video.${ext(video, "mp4")}`;
    let ff: Awaited<ReturnType<typeof ensureLoaded>> | null = null;
    try {
      // Render the overlay PNG at the video's native resolution.
      const canvas = document.createElement("canvas");
      canvas.width = dims.w;
      canvas.height = dims.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      drawText(ctx, dims.w, dims.h, text, vpos, sizePct / 100, color);
      const overlayBlob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      });
      const overlayBytes = new Uint8Array(await overlayBlob.arrayBuffer());

      ff = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile(vName, await fetchFile(video));
      await ff.writeFile("overlay.png", overlayBytes);
      const code = await ff.exec([
        "-i", vName,
        "-i", "overlay.png",
        "-filter_complex", "[0:v][1:v]overlay=0:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "copy",
        "output.mp4",
      ]);
      if (code !== 0) throw new Error("ffmpeg failed");
      const data = await ff.readFile("output.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      if (blob.size === 0) throw new Error("empty");
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      const base = video.name.replace(/\.[a-z0-9]+$/i, "") || "video";
      setResult({ url, size: blob.size, name: `${base}-captioned.mp4` });
      setRunPercent(100);
    } catch {
      setError(
        "Could not add the text. The video codec may be unsupported — try Video Converter to make an MP4 first.",
      );
    } finally {
      if (ff) {
        try { await ff.deleteFile(vName); } catch {}
        try { await ff.deleteFile("overlay.png"); } catch {}
        try { await ff.deleteFile("output.mp4"); } catch {}
      }
      setRunning(false);
    }
  }, [video, dims, text, vpos, sizePct, color, running, ensureLoaded, setRunPercent]);

  const reset = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setVideo(null);
    setVideoUrl(null);
    setDims(null);
    setResult(null);
    setError(null);
  }, []);

  if (!video) {
    return (
      <FileDropzone
        accept="video/*"
        onFiles={pickVideo}
        hint="Drop a video. You'll add a text caption over it next."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{video.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(video.size)}
            {dims ? ` · ${dims.w}×${dims.h}` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {videoUrl && (
        <Panel title="Video" bodyClassName="p-3">
          <video
            src={videoUrl}
            controls
            playsInline
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              if (el.videoWidth && el.videoHeight) {
                setDims({ w: el.videoWidth, h: el.videoHeight });
              }
            }}
            className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted"
          />
        </Panel>
      )}

      <EngineStatus state={state} loadPercent={loadPercent} onRetry={() => void ensureLoaded().catch(() => {})} />

      <Panel title="Caption" bodyClassName="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="txt">Text</Label>
          <Input id="txt" value={text} onChange={(e) => setText(e.target.value)} placeholder="Your caption" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vpos">Vertical position</Label>
            <Select id="vpos" value={vpos} onChange={(e) => setVpos(e.target.value as VPos)}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="color">Text color</Label>
            <input
              id="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-card p-1"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="size">Font size</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{sizePct}% of height</span>
          </div>
          <Slider id="size" min={3} max={20} step={1} value={sizePct} onChange={(e) => setSizePct(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Preview</Label>
          <canvas
            ref={previewRef}
            width={480}
            height={270}
            className="w-full max-w-md rounded-md border border-border"
          />
          <p className="text-xs text-muted-foreground">
            <Type className="mr-1 inline h-3 w-3" aria-hidden />
            Styling preview only — the caption is rendered at the video&apos;s full resolution on export.
          </p>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={!dims || !text || running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          Add text to video
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {state === "ready" ? `Processing ${runPercent}%` : `Waiting for engine (${loadPercent}%)`}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {result && (
        <Panel title="Result" bodyClassName="flex flex-col gap-3 p-3">
          <video src={result.url} controls playsInline className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted" />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => { void fetch(result.url).then((r) => r.blob()).then((b) => downloadBlob(b, result.name)); }}>
              <Download className="h-4 w-4" aria-hidden />
              Download
            </Button>
            <span className="text-xs text-muted-foreground">{result.name} · {formatBytes(result.size)}</span>
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="add-text-to-video">
      <AddTextToVideoClient />
    </ToolPage>
  );
}
