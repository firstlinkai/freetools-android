"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, RotateCcw, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "./use-ffmpeg";

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

interface Result {
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

/**
 * Shared workbench for single-input FFmpeg video tools. Handles the file drop,
 * native <video> preview, engine loading/status, run progress, result preview,
 * download, and teardown. Each tool supplies its own controls plus a `getArgs`
 * that returns the full FFmpeg command for the chosen input/output names.
 */
export function VideoWorkbench({
  hint,
  runLabel = "Process video",
  outSuffix,
  outExt,
  outMime = "video/mp4",
  controls,
  getArgs,
  canRun = true,
  onMeta,
  note,
}: {
  hint?: string;
  runLabel?: string;
  outSuffix: string;
  outExt: string;
  outMime?: string;
  controls: React.ReactNode;
  getArgs: (io: { input: string; output: string; meta: VideoMeta }) => string[];
  canRun?: boolean;
  onMeta?: (meta: VideoMeta) => void;
  note?: React.ReactNode;
}) {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta>({ duration: 0, width: 0, height: 0 });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
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

  const clearResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
  }, []);

  const onFiles = useCallback(
    (files: File[]) => {
      const next = files[0];
      if (!next) return;
      clearResult();
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      const url = URL.createObjectURL(next);
      videoUrlRef.current = url;
      setFile(next);
      setVideoUrl(url);
      setError(null);
      void ensureLoaded().catch(() => {});
    },
    [clearResult, ensureLoaded],
  );

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const m: VideoMeta = {
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      width: v.videoWidth,
      height: v.videoHeight,
    };
    setMeta(m);
    onMeta?.(m);
  }, [onMeta]);

  const reset = useCallback(() => {
    clearResult();
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setFile(null);
    setVideoUrl(null);
    setMeta({ duration: 0, width: 0, height: 0 });
    setError(null);
  }, [clearResult]);

  const run = useCallback(async () => {
    if (!file || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    clearResult();

    const inputName = `input.${inputExtension(file)}`;
    const outputName = `output.${outExt}`;
    let ffmpeg: Awaited<ReturnType<typeof ensureLoaded>> | null = null;

    try {
      ffmpeg = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const args = getArgs({ input: inputName, output: outputName, meta });
      const code = await ffmpeg.exec(args);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data as BlobPart], { type: outMime });
      if (blob.size === 0) throw new Error("empty output");

      const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "video";
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size, filename: `${base}-${outSuffix}.${outExt}` });
      setRunPercent(100);
    } catch {
      setError(
        "Processing failed. This clip's codec may not be supported by the in-browser engine, or the settings produced no output.",
      );
    } finally {
      if (ffmpeg) {
        try {
          await ffmpeg.deleteFile(inputName);
        } catch {}
        try {
          await ffmpeg.deleteFile(outputName);
        } catch {}
      }
      setRunning(false);
    }
  }, [
    file,
    running,
    outExt,
    outMime,
    outSuffix,
    meta,
    getArgs,
    ensureLoaded,
    setRunPercent,
    clearResult,
  ]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!file || !videoUrl) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="video/*"
          onFiles={onFiles}
          hint={hint ?? "MP4, MOV, or WebM. Everything runs in your browser."}
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
            {meta.width > 0 ? `${meta.width}×${meta.height} · ` : ""}
            {formatBytes(file.size)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {/* Engine status */}
      <Panel bodyClassName="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Zap className="h-4 w-4 text-accent" aria-hidden />
          <span className="text-sm font-medium text-foreground">Video engine</span>
          {state === "ready" && <Badge>Ready</Badge>}
          {state === "loading" && (
            <Badge>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Downloading {loadPercent}%
            </Badge>
          )}
          {state === "error" && <span className="text-xs text-danger">Failed to load</span>}
        </div>
        {state === "loading" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${loadPercent}%` }} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The engine (~31 MB) downloads once and is cached by your browser. Your
          video never leaves this device.
        </p>
        {state === "error" && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => void ensureLoaded().catch(() => {})}>
            Retry download
          </Button>
        )}
      </Panel>

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

      {/* Tool-specific controls */}
      <Panel title="Settings" bodyClassName="p-4">
        {controls}
        {note && <div className="mt-3 text-xs text-muted-foreground">{note}</div>}
      </Panel>

      {/* Run */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={running || !canRun || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          {runLabel}
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {engineReady ? `Processing ${runPercent}%` : `Waiting for engine (${loadPercent}%)`}
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
          <video src={result.url} controls playsInline className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted" />
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
