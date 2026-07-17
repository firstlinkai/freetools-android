import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, Music, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

type Target = "mp3" | "wav";

const TARGETS: Record<Target, { label: string; codec: string[]; ext: string; mime: string }> = {
  // -vn drops the picture; libmp3lame VBR ~190 kbps is transparent for most uses.
  mp3: { label: "MP3 (small, universal)", codec: ["-acodec", "libmp3lame", "-q:a", "2"], ext: "mp3", mime: "audio/mpeg" },
  wav: { label: "WAV (lossless, large)", codec: ["-acodec", "pcm_s16le"], ext: "wav", mime: "audio/wav" },
};

const TARGET_ORDER: Target[] = ["mp3", "wav"];

interface ExtractResult {
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

export function VideoToMp3Client() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>("mp3");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
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

    const t = TARGETS[target];
    const inputName = `input.${inputExtension(file)}`;
    const outName = `out.${t.ext}`;
    let ffmpeg: FFmpegInstance | null = null;

    try {
      ffmpeg = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const code = await ffmpeg.exec(["-i", inputName, "-vn", ...t.codec, outName]);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: t.mime });
      if (blob.size === 0) throw new Error("empty output");

      const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "audio";
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size, filename: `${base}.${t.ext}` });
      setRunPercent(100);
    } catch {
      setError(
        "Extraction failed. The clip may have no audio track, or its codec is not supported by the in-browser engine.",
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
  }, [file, running, target, ensureLoaded, setRunPercent, clearResult]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!file || !videoUrl) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="video/*"
          onFiles={onFiles}
          hint="MP4, MOV, or WebM. The audio track is extracted on your device."
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

      {/* Settings */}
      <Panel title="Audio format" bodyClassName="p-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="target">Extract as</Label>
          <Select id="target" value={target} onChange={(e) => setTarget(e.target.value as Target)} disabled={running}>
            {TARGET_ORDER.map((t) => (
              <option key={t} value={t}>
                {TARGETS[t].label}
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-muted-foreground">
            MP3 suits music and voice notes; WAV keeps the audio uncompressed for editing.
          </p>
        </div>
      </Panel>

      {/* Run */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Music className="h-4 w-4" aria-hidden />}
          Extract audio
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
          <audio src={result.url} controls className="w-full" />
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
    <ToolPage slug="video-to-mp3">
      <VideoToMp3Client />
    </ToolPage>
  );
}
