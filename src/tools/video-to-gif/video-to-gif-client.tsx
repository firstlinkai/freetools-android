import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Download, Film, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

/** GIFs balloon fast; cap clips to keep output sizes and encode times sane. */
const MAX_DURATION = 15;
const MIN_DURATION = 0.5;

interface GifResult {
  url: string;
  size: number;
  filename: string;
}

function inputExtension(file: File): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  return "mp4";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function VideoToGifClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  const [start, setStart] = useState(0);
  const [startText, setStartText] = useState("0.0");
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(320);

  const [running, setRunning] = useState(false);
  const [pass, setPass] = useState<0 | 1 | 2>(0);
  const [result, setResult] = useState<GifResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  useEffect(() => setStartText(start.toFixed(1)), [start]);

  const clearResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
  }, []);

  const reset = useCallback(() => {
    clearResult();
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setFile(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setStart(0);
    setDuration(5);
    setError(null);
  }, [clearResult]);

  const onFiles = useCallback(
    (files: File[]) => {
      const next = files[0];
      if (!next) return;
      reset();
      const url = URL.createObjectURL(next);
      videoUrlRef.current = url;
      setFile(next);
      setVideoUrl(url);
      void ensureLoaded().catch(() => {});
    },
    [reset, ensureLoaded],
  );

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    setVideoDuration(v.duration);
    setStart(0);
    setDuration(clamp(v.duration, MIN_DURATION, 5));
  }, []);

  const maxStart = Math.max(0, videoDuration - MIN_DURATION);
  const maxClip = clamp(videoDuration - start, MIN_DURATION, MAX_DURATION);
  const clipLength = clamp(duration, MIN_DURATION, maxClip);

  const commitStartText = useCallback(() => {
    const parsed = Number(startText);
    if (!Number.isFinite(parsed)) {
      setStartText(start.toFixed(1));
      return;
    }
    setStart(clamp(parsed, 0, maxStart));
  }, [startText, start, maxStart]);

  const setStartHere = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setStart(clamp(t, 0, maxStart));
  }, [maxStart]);

  const run = useCallback(async () => {
    if (!file || running || videoDuration <= 0) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    clearResult();

    const inputName = `input.${inputExtension(file)}`;
    const paletteName = "palette.png";
    const outName = "out.gif";
    let ffmpeg: FFmpegInstance | null = null;

    const startArg = start.toFixed(3);
    const durArg = clipLength.toFixed(3);
    // Lanczos keeps downscaled frames crisp; height follows the aspect ratio.
    const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;

    try {
      ffmpeg = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Pass 1: build an optimal 256-color palette from the selected clip.
      setPass(1);
      const paletteCode = await ffmpeg.exec([
        "-ss", startArg, "-t", durArg, "-i", inputName,
        "-vf", `${filters},palettegen=stats_mode=diff`,
        paletteName,
      ]);
      if (paletteCode !== 0) throw new Error(`palettegen exited with code ${paletteCode}`);

      // Pass 2: encode the GIF with that palette (far better than the generic one).
      setPass(2);
      setRunPercent(0);
      const gifCode = await ffmpeg.exec([
        "-ss", startArg, "-t", durArg, "-i", inputName,
        "-i", paletteName,
        "-filter_complex", `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
        "-loop", "0",
        outName,
      ]);
      if (gifCode !== 0) throw new Error(`ffmpeg exited with code ${gifCode}`);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: "image/gif" });
      if (blob.size === 0) throw new Error("empty output");

      const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "clip";
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size, filename: `${base}.gif` });
      setRunPercent(100);
    } catch {
      setError(
        "GIF conversion failed. This clip's codec may not be supported by the in-browser engine, or the selected range is outside the video.",
      );
    } finally {
      if (ffmpeg) {
        try {
          await ffmpeg.deleteFile(inputName);
        } catch {}
        try {
          await ffmpeg.deleteFile(paletteName);
        } catch {}
        try {
          await ffmpeg.deleteFile(outName);
        } catch {}
      }
      setPass(0);
      setRunning(false);
    }
  }, [file, running, videoDuration, start, clipLength, fps, width, ensureLoaded, setRunPercent, clearResult]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!file || !videoUrl) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="video/*"
          onFiles={onFiles}
          hint="MP4, MOV, or WebM. Pick up to 15 seconds to turn into a looping GIF."
        />
      </Panel>
    );
  }

  const engineReady = state === "ready";

  return (
    <div className="flex flex-col gap-4">
      {/* File info */}
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Film className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {videoDuration > 0 ? `${videoDuration.toFixed(1)}s · ` : ""}
            {formatBytes(file.size)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {/* Engine status */}
      <EngineStatus state={state} loadPercent={loadPercent} onRetry={() => void ensureLoaded().catch(() => {})} />

      {/* Preview */}
      <Panel title="Preview" bodyClassName="p-3">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted"
        />
      </Panel>

      {/* Settings */}
      <Panel title="GIF settings" bodyClassName="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gif-start">Start (seconds)</Label>
            <Input
              id="gif-start"
              inputMode="decimal"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={commitStartText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitStartText();
              }}
              disabled={running}
              className="w-28 font-mono"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={setStartHere} disabled={videoDuration <= 0 || running}>
            Start here
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="gif-duration">Duration</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{clipLength.toFixed(1)}s</span>
          </div>
          <Slider
            id="gif-duration"
            min={MIN_DURATION}
            max={maxClip}
            step={0.5}
            value={clipLength}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={running}
          />
          <p className="text-[11px] text-muted-foreground">Capped at {MAX_DURATION}s — longer GIFs get enormous.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="gif-fps">Frame rate</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{fps} fps</span>
          </div>
          <Slider
            id="gif-fps"
            min={5}
            max={15}
            step={1}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={running}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="gif-width">Width</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{width}px</span>
          </div>
          <Slider
            id="gif-width"
            min={160}
            max={480}
            step={16}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            disabled={running}
          />
          <p className="text-[11px] text-muted-foreground">
            Height follows the video's aspect ratio. Lower fps and width shrink the file.
          </p>
        </div>
      </Panel>

      {/* Run */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={running || videoDuration <= 0 || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Clapperboard className="h-4 w-4" aria-hidden />}
          Create GIF
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {engineReady
              ? `${pass === 1 ? "Building palette" : "Encoding GIF"} (pass ${pass}/2) ${runPercent}%`
              : `Waiting for engine (${loadPercent}%)`}
          </span>
        )}
      </div>
      {running && engineReady && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${runPercent}%` }} />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Result */}
      {result && (
        <Panel title="Result" bodyClassName="flex flex-col gap-3 p-3">
          <img
            src={result.url}
            alt="Generated GIF preview"
            className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                void fetch(result.url)
                  .then((r) => r.blob())
                  .then((b) => downloadBlob(b, result.filename));
              }}
            >
              <Download className="h-4 w-4" aria-hidden />
              Download
            </Button>
            <span className="text-xs text-muted-foreground">
              {result.filename} · {formatBytes(result.size)}
            </span>
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="video-to-gif">
      <VideoToGifClient />
    </ToolPage>
  );
}
