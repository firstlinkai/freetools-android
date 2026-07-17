import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, RotateCcw, Video, X, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToolPage } from "@/components/tool/tool-page";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

type Position = "tl" | "tr" | "bl" | "br" | "center";

const OVERLAY: Record<Position, string> = {
  tl: "16:16",
  tr: "W-w-16:16",
  bl: "16:H-h-16",
  br: "W-w-16:H-h-16",
  center: "(W-w)/2:(H-h)/2",
};

function ext(file: File, fallback: string): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? fallback;
}

export function AddImageToVideoClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();
  const [video, setVideo] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [position, setPosition] = useState<Position>("tr");
  const [size, setSize] = useState(30); // % of the image's own width
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const pickVideo = useCallback((f: File[]) => {
    if (f[0]) {
      setVideo(f[0]);
      void ensureLoaded().catch(() => {});
    }
  }, [ensureLoaded]);

  const run = useCallback(async () => {
    if (!video || !image || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);

    const vName = `video.${ext(video, "mp4")}`;
    const iName = `overlay.${ext(image, "png")}`;
    const frac = (size / 100).toFixed(3);
    let ff: Awaited<ReturnType<typeof ensureLoaded>> | null = null;
    try {
      ff = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile(vName, await fetchFile(video));
      await ff.writeFile(iName, await fetchFile(image));
      const code = await ff.exec([
        "-i", vName,
        "-i", iName,
        "-filter_complex", `[1:v]scale=iw*${frac}:-1[wm];[0:v][wm]overlay=${OVERLAY[position]}`,
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
      setResult({ url, size: blob.size, name: `${base}-watermarked.mp4` });
      setRunPercent(100);
    } catch {
      setError("Could not add the image. The video codec may be unsupported — try Video Converter to make an MP4 first.");
    } finally {
      if (ff) {
        try { await ff.deleteFile(vName); } catch {}
        try { await ff.deleteFile(iName); } catch {}
        try { await ff.deleteFile("output.mp4"); } catch {}
      }
      setRunning(false);
    }
  }, [video, image, position, size, running, ensureLoaded, setRunPercent]);

  const reset = useCallback(() => {
    setVideo(null);
    setImage(null);
    setResult(null);
    setError(null);
  }, []);

  if (!video) {
    return (
      <FileDropzone
        accept="video/*"
        onFiles={pickVideo}
        hint="Step 1: drop the video. You'll add a logo or watermark image next."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{video.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(video.size)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      <EngineStatus state={state} loadPercent={loadPercent} onRetry={() => void ensureLoaded().catch(() => {})} />

      <Panel title="Overlay image" bodyClassName="p-3">
        {image ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{image.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(image.size)}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove image" onClick={() => setImage(null)}>
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <FileDropzone accept="image/*" onFiles={(f) => f[0] && setImage(f[0])} hint="Step 2: drop a PNG or JPG (PNG keeps transparency)." />
        )}
      </Panel>

      {image && (
        <Panel title="Placement" bodyClassName="space-y-4 p-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="pos">Position</Label>
            <Select id="pos" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
              <option value="tl">Top left</option>
              <option value="tr">Top right</option>
              <option value="bl">Bottom left</option>
              <option value="br">Bottom right</option>
              <option value="center">Center</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="size">Image size</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{size}%</span>
            </div>
            <Slider id="size" min={5} max={100} step={5} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={!image || running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          Add image to video
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {state === "ready" ? `Processing ${runPercent}%` : `Waiting for engine (${loadPercent}%)`}
          </span>
        )}
      </div>

      {error && <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">{error}</div>}

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
    <ToolPage slug="add-image-to-video">
      <AddImageToVideoClient />
    </ToolPage>
  );
}
