import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Music, RotateCcw, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

type Target = "mp3" | "wav" | "ogg" | "m4a";

const TARGETS: Record<
  Target,
  { label: string; codec: string[]; ext: string; mime: string }
> = {
  mp3: { label: "MP3", codec: ["-c:a", "libmp3lame", "-q:a", "2"], ext: "mp3", mime: "audio/mpeg" },
  wav: { label: "WAV", codec: ["-c:a", "pcm_s16le"], ext: "wav", mime: "audio/wav" },
  ogg: { label: "OGG", codec: ["-c:a", "libvorbis"], ext: "ogg", mime: "audio/ogg" },
  m4a: { label: "M4A", codec: ["-c:a", "aac"], ext: "m4a", mime: "audio/mp4" },
};

const TARGET_ORDER: Target[] = ["mp3", "wav", "ogg", "m4a"];

function ext(file: File, fallback: string): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? fallback;
}

export function AudioConverterClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();
  const [audio, setAudio] = useState<File | null>(null);
  const [target, setTarget] = useState<Target>("mp3");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const pickAudio = useCallback(
    (f: File[]) => {
      if (!f[0]) return;
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = null;
      }
      setResult(null);
      setError(null);
      setAudio(f[0]);
      const url = URL.createObjectURL(f[0]);
      sourceUrlRef.current = url;
      setSourceUrl(url);
      void ensureLoaded().catch(() => {});
    },
    [ensureLoaded],
  );

  const run = useCallback(async () => {
    if (!audio || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);

    const t = TARGETS[target];
    const inName = `input.${ext(audio, "mp3")}`;
    const outName = `output.${t.ext}`;
    let ff: Awaited<ReturnType<typeof ensureLoaded>> | null = null;
    try {
      ff = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile(inName, await fetchFile(audio));
      const code = await ff.exec(["-i", inName, ...t.codec, outName]);
      if (code !== 0) throw new Error("ffmpeg failed");
      const data = await ff.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: t.mime });
      if (blob.size === 0) throw new Error("empty");
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      const base = audio.name.replace(/\.[a-z0-9]+$/i, "") || "audio";
      setResult({ url, size: blob.size, name: `${base}.${t.ext}` });
      setRunPercent(100);
    } catch {
      setError(
        `Could not convert to ${t.label}. This codec may be unavailable in the browser engine — try a different target format.`,
      );
    } finally {
      if (ff) {
        try { await ff.deleteFile(inName); } catch {}
        try { await ff.deleteFile(outName); } catch {}
      }
      setRunning(false);
    }
  }, [audio, target, running, ensureLoaded, setRunPercent]);

  const reset = useCallback(() => {
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = null;
    }
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setAudio(null);
    setSourceUrl(null);
    setResult(null);
    setError(null);
  }, []);

  if (!audio) {
    return (
      <FileDropzone
        accept="audio/*"
        onFiles={pickAudio}
        hint="Drop an audio file (MP3, WAV, OGG, M4A, and more)."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{audio.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(audio.size)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {sourceUrl && (
        <Panel title="Original" bodyClassName="p-3">
          <audio src={sourceUrl} controls className="w-full" />
        </Panel>
      )}

      <EngineStatus state={state} loadPercent={loadPercent} onRetry={() => void ensureLoaded().catch(() => {})} />

      <Panel title="Convert to" bodyClassName="space-y-4 p-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="target">Target format</Label>
          <Select id="target" value={target} onChange={(e) => setTarget(e.target.value as Target)}>
            {TARGET_ORDER.map((t) => (
              <option key={t} value={t}>
                {TARGETS[t].label}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          Convert to {TARGETS[target].label}
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
          <audio src={result.url} controls className="w-full" />
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
    <ToolPage slug="audio-converter">
      <AudioConverterClient />
    </ToolPage>
  );
}
