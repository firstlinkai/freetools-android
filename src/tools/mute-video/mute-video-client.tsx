import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, RotateCcw, VolumeX } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

interface MuteResult {
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
 * Stream copy cannot change containers, so the output keeps a compatible one:
 * webm stays webm, QuickTime-family goes to mp4, anything else is untouched.
 */
function outputFormat(inputExt: string): { ext: string; mime: string } {
  if (inputExt === "webm") return { ext: "webm", mime: "video/webm" };
  if (inputExt === "mp4" || inputExt === "mov" || inputExt === "m4v") {
    return { ext: "mp4", mime: "video/mp4" };
  }
  return { ext: inputExt, mime: "video/mp4" };
}

export function MuteVideoClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const reset = useCallback(() => {
    clearResult();
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setFile(null);
    setVideoUrl(null);
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

  const run = useCallback(async () => {
    if (!file || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    clearResult();

    const ext = inputExtension(file);
    const inputName = `input.${ext}`;
    const { ext: outExt, mime } = outputFormat(ext);
    const outName = `out.${outExt}`;
    let ffmpeg: FFmpegInstance | null = null;

    try {
      ffmpeg = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // -an drops every audio stream; -c:v copy keeps the picture untouched,
      // so muting is near-instant with zero quality loss.
      const code = await ffmpeg.exec(["-i", inputName, "-c:v", "copy", "-an", outName]);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: mime });
      if (blob.size === 0) throw new Error("empty output");

      const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "video";
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size, filename: `${base}-muted.${outExt}` });
      setRunPercent(100);
    } catch {
      setError(
        "Muting failed. This container may not support stream copy in the in-browser engine — try converting the video to MP4 first.",
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
      setRunning(false);
    }
  }, [file, running, ensureLoaded, setRunPercent, clearResult]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!file || !videoUrl) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="video/*"
          onFiles={onFiles}
          hint="MP4, MOV, or WebM. Audio is stripped instantly — no re-encode."
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
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
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
          src={videoUrl}
          controls
          playsInline
          className="h-auto max-h-[420px] max-w-full rounded-md border border-border bg-muted"
        />
      </Panel>

      {/* Run */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          Mute video
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {engineReady ? `Processing ${runPercent}%` : `Waiting for engine (${loadPercent}%)`}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Removes every audio track. The picture is copied as-is, so quality and file
        structure are unchanged.
      </p>

      {error && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">{error}</div>
      )}

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
    <ToolPage slug="mute-video">
      <MuteVideoClient />
    </ToolPage>
  );
}
