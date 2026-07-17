import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Music, RotateCcw, Video, X, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { ToolPage } from "@/components/tool/tool-page";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

function ext(file: File, fallback: string): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? fallback;
}

export function AddAudioToVideoClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();
  const [video, setVideo] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
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
    if (!video || !audio || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);

    const vName = `video.${ext(video, "mp4")}`;
    const aName = `audio.${ext(audio, "mp3")}`;
    let ff: Awaited<ReturnType<typeof ensureLoaded>> | null = null;
    try {
      ff = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile(vName, await fetchFile(video));
      await ff.writeFile(aName, await fetchFile(audio));
      const code = await ff.exec([
        "-i", vName,
        "-i", aName,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "output.mp4",
      ]);
      if (code !== 0) throw new Error("ffmpeg failed");
      const data = await ff.readFile("output.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      if (blob.size === 0) throw new Error("empty");
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      const base = video.name.replace(/\.[a-z0-9]+$/i, "") || "video";
      setResult({ url, size: blob.size, name: `${base}-with-audio.mp4` });
      setRunPercent(100);
    } catch {
      setError("Could not add the audio. The video codec may not be copyable — try Video Converter to make an MP4 first.");
    } finally {
      if (ff) {
        try { await ff.deleteFile(vName); } catch {}
        try { await ff.deleteFile(aName); } catch {}
        try { await ff.deleteFile("output.mp4"); } catch {}
      }
      setRunning(false);
    }
  }, [video, audio, running, ensureLoaded, setRunPercent]);

  const reset = useCallback(() => {
    setVideo(null);
    setAudio(null);
    setResult(null);
    setError(null);
  }, []);

  if (!video) {
    return (
      <FileDropzone
        accept="video/*"
        onFiles={pickVideo}
        hint="Step 1: drop the video. You'll add an audio track next."
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

      <Panel title="Audio track" bodyClassName="p-3">
        {audio ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{audio.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(audio.size)}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove audio" onClick={() => setAudio(null)}>
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <FileDropzone accept="audio/*" onFiles={(f) => f[0] && setAudio(f[0])} hint="Step 2: drop an MP3, WAV, or other audio file." />
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={!audio || running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          Add audio to video
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

      <p className="text-xs text-muted-foreground">
        The video track is copied untouched; the new audio is encoded to AAC and
        trimmed to the shorter of the two. The original video audio is replaced.
      </p>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="add-audio-to-video">
      <AddAudioToVideoClient />
    </ToolPage>
  );
}
