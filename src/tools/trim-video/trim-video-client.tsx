import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, RotateCcw, Scissors } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";
import { RangeSlider } from "./range-slider";
import { clamp, formatTime, parseTime } from "./time";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

type TrimMode = "copy" | "encode";

const MIN_GAP = 0.1;

interface TrimResult {
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

/** Output extension + mime for the chosen mode. Re-encode always emits mp4. */
function outputFormat(inputExt: string, mode: TrimMode): {
  ext: string;
  mime: string;
} {
  if (mode === "encode") return { ext: "mp4", mime: "video/mp4" };
  if (inputExt === "webm") return { ext: "webm", mime: "video/webm" };
  if (inputExt === "mp4" || inputExt === "mov" || inputExt === "m4v") {
    return { ext: "mp4", mime: "video/mp4" };
  }
  // Stream copy cannot change containers, so keep whatever came in.
  return { ext: inputExt, mime: "video/mp4" };
}

export function TrimVideoClient() {
  // Shared, bundled ffmpeg.wasm engine (loaded once per session, fully offline).
  const { state: engineState, loadPercent, runPercent, setRunPercent, ensureLoaded } =
    useFfmpeg();

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [startText, setStartText] = useState("00:00.0");
  const [endText, setEndText] = useState("00:00.0");

  const [mode, setMode] = useState<TrimMode>("copy");
  const [trimming, setTrimming] = useState(false);
  const [result, setResult] = useState<TrimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  // Keep the editable time fields in sync when the slider moves.
  useEffect(() => setStartText(formatTime(start)), [start]);
  useEffect(() => setEndText(formatTime(end)), [end]);

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
    setDuration(0);
    setStart(0);
    setEnd(0);
    setMode("copy");
    setTrimming(false);
    setError(null);
    // The loaded engine is kept; it is cached and file-independent.
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
      // Auto-load the engine so it is ready by the time the user hits Trim.
      void ensureLoaded().catch(() => {});
    },
    [reset, ensureLoaded],
  );

  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    setDuration(video.duration);
    setStart(0);
    setEnd(video.duration);
  }, []);

  const applyRange = useCallback(
    (nextStart: number, nextEnd: number) => {
      setStart(clamp(nextStart, 0, Math.max(0, duration - MIN_GAP)));
      setEnd(clamp(nextEnd, MIN_GAP, duration));
    },
    [duration],
  );

  const commitStartText = useCallback(() => {
    const parsed = parseTime(startText);
    if (parsed === null) {
      setStartText(formatTime(start));
      return;
    }
    setStart(clamp(parsed, 0, Math.max(0, end - MIN_GAP)));
  }, [startText, start, end]);

  const commitEndText = useCallback(() => {
    const parsed = parseTime(endText);
    if (parsed === null) {
      setEndText(formatTime(end));
      return;
    }
    setEnd(clamp(parsed, Math.min(duration, start + MIN_GAP), duration));
  }, [endText, start, end, duration]);

  const setStartHere = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setStart(clamp(t, 0, Math.max(0, end - MIN_GAP)));
  }, [end]);

  const setEndHere = useCallback(() => {
    const t = videoRef.current?.currentTime ?? duration;
    setEnd(clamp(t, Math.min(duration, start + MIN_GAP), duration));
  }, [start, duration]);

  const trim = useCallback(async () => {
    if (!file || trimming || duration <= 0) return;
    setTrimming(true);
    setRunPercent(0);
    setError(null);
    clearResult();

    const ext = inputExtension(file);
    const inputName = `input.${ext}`;
    const { ext: outExt, mime } = outputFormat(ext, mode);
    const outName = `out.${outExt}`;
    let ffmpeg: FFmpegInstance | null = null;

    try {
      ffmpeg = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const startArg = start.toFixed(3);
      const endArg = end.toFixed(3);
      const args =
        mode === "copy"
          ? ["-i", inputName, "-ss", startArg, "-to", endArg, "-c", "copy", outName]
          : [
              "-i", inputName,
              "-ss", startArg,
              "-to", endArg,
              "-c:v", "libx264",
              "-preset", "veryfast",
              "-crf", "23",
              "-c:a", "aac",
              outName,
            ];

      const code = await ffmpeg.exec(args);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: mime });
      if (blob.size === 0) throw new Error("empty output");

      const baseName = file.name.replace(/\.[a-z0-9]+$/i, "") || "clip";
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size, filename: `${baseName}-trim.${outExt}` });
      setRunPercent(100);
    } catch {
      setError(
        mode === "copy"
          ? "Trimming failed. Fast copy cannot handle every codec. Try the precise re-encode mode."
          : "Trimming failed. This video codec may not be supported by the built-in engine.",
      );
    } finally {
      if (ffmpeg) {
        try {
          await ffmpeg.deleteFile(inputName);
        } catch {}
        try {
          await ffmpeg.deleteFile(outName);
        } catch {}
      }
      setTrimming(false);
    }
  }, [file, trimming, duration, mode, start, end, ensureLoaded, setRunPercent, clearResult]);

  const downloadResult = useCallback(async () => {
    if (!result) return;
    const blob = await fetch(result.url).then((r) => r.blob());
    downloadBlob(blob, result.filename);
  }, [result]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!file || !videoUrl) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="video/*"
          onFiles={onFiles}
          hint="MP4, MOV, or WebM work best. Trimming runs entirely on your device."
        />
      </Panel>
    );
  }

  const clipLength = Math.max(0, end - start);
  const engineReady = engineState === "ready";

  return (
    <div className="flex flex-col gap-4">
      {/* File info bar */}
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Film className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {duration > 0 ? `${formatTime(duration)} · ` : ""}
            {formatBytes(file.size)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {/* Engine status */}
      <EngineStatus
        state={engineState}
        loadPercent={loadPercent}
        onRetry={() => void ensureLoaded().catch(() => {})}
      />

      {/* Preview + trim range */}
      <Panel title="Trim range" bodyClassName="flex flex-col gap-4 p-3">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted"
        />

        <RangeSlider
          max={Math.max(duration, MIN_GAP)}
          start={start}
          end={end}
          onChange={applyRange}
          disabled={duration <= 0 || trimming}
          className="mt-1"
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trim-start">Start</Label>
            <Input
              id="trim-start"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={commitStartText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitStartText();
              }}
              disabled={trimming}
              className="w-28 font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trim-end">End</Label>
            <Input
              id="trim-end"
              value={endText}
              onChange={(e) => setEndText(e.target.value)}
              onBlur={commitEndText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEndText();
              }}
              disabled={trimming}
              className="w-28 font-mono"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={setStartHere}
            disabled={duration <= 0 || trimming}
          >
            Set start here
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={setEndHere}
            disabled={duration <= 0 || trimming}
          >
            Set end here
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Clip: {formatTime(start)} to {formatTime(end)} (
          {clipLength.toFixed(1)}s)
        </p>
      </Panel>

      {/* Mode + execute */}
      <Panel title="Trim" bodyClassName="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trim-mode">Mode</Label>
          <Select
            id="trim-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as TrimMode)}
            disabled={trimming}
            className="max-w-xs"
          >
            <option value="copy">Fast copy (keyframe aligned)</option>
            <option value="encode">Precise re-encode</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            {mode === "copy"
              ? "No re-encoding, nearly instant. Cut points snap to the nearest keyframes, so the clip may start slightly early."
              : "Re-encodes to H.264 MP4. Frame-exact cuts, but slower on long clips."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void trim()}
            disabled={trimming || duration <= 0 || clipLength < MIN_GAP || engineState === "error"}
          >
            {trimming ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Scissors className="h-4 w-4" aria-hidden />
            )}
            Trim video
          </Button>
          {trimming && (
            <span className="text-xs text-muted-foreground">
              {engineReady
                ? `Trimming ${runPercent}%`
                : `Waiting for engine (${loadPercent}%)`}
            </span>
          )}
        </div>

        {trimming && engineReady && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${runPercent}%` }}
            />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </Panel>

      {/* Result */}
      {result && (
        <Panel title="Result" bodyClassName="flex flex-col gap-3 p-3">
          <video
            src={result.url}
            controls
            playsInline
            className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void downloadResult()}>
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
    <ToolPage slug="trim-video">
      <TrimVideoClient />
    </ToolPage>
  );
}
