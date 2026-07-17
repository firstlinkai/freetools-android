import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Music, RotateCcw, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

function ext(file: File, fallback: string): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? fallback;
}

export function ChangeAudioSpeedClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();
  const [audio, setAudio] = useState<File | null>(null);
  const [speed, setSpeed] = useState(1.5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (inputUrlRef.current) URL.revokeObjectURL(inputUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const pickAudio = useCallback(
    (f: File[]) => {
      if (f[0]) {
        if (inputUrlRef.current) URL.revokeObjectURL(inputUrlRef.current);
        inputUrlRef.current = URL.createObjectURL(f[0]);
        setAudio(f[0]);
        setResult(null);
        setError(null);
        void ensureLoaded().catch(() => {});
      }
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

    const inName = `input.${ext(audio, "mp3")}`;
    let ff: Awaited<ReturnType<typeof ensureLoaded>> | null = null;
    try {
      ff = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      await ff.writeFile(inName, await fetchFile(audio));
      const code = await ff.exec([
        "-i", inName,
        "-filter:a", `atempo=${speed.toFixed(3)}`,
        "output.wav",
      ]);
      if (code !== 0) throw new Error("ffmpeg failed");
      const data = await ff.readFile("output.wav");
      const blob = new Blob([data as BlobPart], { type: "audio/wav" });
      if (blob.size === 0) throw new Error("empty");
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      const base = audio.name.replace(/\.[a-z0-9]+$/i, "") || "audio";
      setResult({ url, size: blob.size, name: `${base}-speed.wav` });
      setRunPercent(100);
    } catch {
      setError("Could not change the speed. The file may be corrupt or in an unsupported format.");
    } finally {
      if (ff) {
        try { await ff.deleteFile(inName); } catch {}
        try { await ff.deleteFile("output.wav"); } catch {}
      }
      setRunning(false);
    }
  }, [audio, running, speed, ensureLoaded, setRunPercent]);

  const reset = useCallback(() => {
    if (inputUrlRef.current) {
      URL.revokeObjectURL(inputUrlRef.current);
      inputUrlRef.current = null;
    }
    setAudio(null);
    setResult(null);
    setError(null);
    setSpeed(1.5);
  }, []);

  if (!audio) {
    return (
      <FileDropzone
        accept="audio/*"
        onFiles={pickAudio}
        hint="Drop an MP3, WAV, or other audio file to speed up or slow down."
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

      {inputUrlRef.current && (
        <Panel title="Original" bodyClassName="p-3">
          <audio src={inputUrlRef.current} controls className="w-full" />
        </Panel>
      )}

      <EngineStatus state={state} loadPercent={loadPercent} onRetry={() => void ensureLoaded().catch(() => {})} />

      <Panel title="Speed" bodyClassName="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="speed">Playback speed (pitch preserved)</Label>
          <span className="text-sm font-medium text-foreground">{speed.toFixed(2)}×</span>
        </div>
        <Slider
          id="speed"
          min={0.5}
          max={2}
          step={0.05}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          disabled={running}
        />
        <p className="text-xs text-muted-foreground">
          0.5× is half speed, 2× is double speed. 1.00× leaves the audio unchanged.
        </p>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          Change speed
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {state === "ready" ? `Processing ${runPercent}%` : `Waiting for engine (${loadPercent}%)`}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
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

      <p className="text-xs text-muted-foreground">
        Output is a WAV file. The pitch is preserved as the tempo changes.
      </p>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="change-audio-speed">
      <ChangeAudioSpeedClient />
    </ToolPage>
  );
}
