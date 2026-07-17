import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Volume2 } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";
import {
  audioBufferToWav,
  decodeAudioFile,
  formatDuration,
  renderOffline,
} from "@/lib/audio";

interface Source {
  file: File;
  buffer: AudioBuffer;
  url: string; // object URL backing the original preview
}

export function ChangeAudioVolumeClient() {
  const [source, setSource] = useState<Source | null>(null);
  const [percent, setPercent] = useState(100);
  const [decoding, setDecoding] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("audio/")) {
      setError("That file isn't audio. Drop an MP3, WAV, M4A, or OGG file.");
      return;
    }
    setError(null);
    setDecoding(true);
    try {
      const buffer = await decodeAudioFile(f);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(f);
      urlRef.current = url;
      setPercent(100);
      setSource({ file: f, buffer, url });
    } catch {
      setError("Could not decode that audio file. Try a different format.");
    } finally {
      setDecoding(false);
    }
  }, []);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSource(null);
    setPercent(100);
    setError(null);
  }, []);

  const apply = useCallback(async () => {
    if (!source || running) return;
    setRunning(true);
    setError(null);
    try {
      const mult = percent / 100;
      const rendered = await renderOffline(source.buffer, (ctx, node) => {
        const gain = ctx.createGain();
        gain.gain.value = mult;
        node.connect(gain);
        gain.connect(ctx.destination);
      });
      const blob = audioBufferToWav(rendered);
      const base = source.file.name.replace(/\.[^.]+$/, "") || "audio";
      downloadBlob(blob, `${base}-volume.wav`);
    } catch {
      setError("Something went wrong while processing the audio.");
    } finally {
      setRunning(false);
    }
  }, [source, percent, running]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="audio/*"
          onFiles={(files) => void handleFiles(files)}
          hint="MP3, WAV, M4A, or OGG. Adjust the volume and download a WAV."
        />
        {decoding && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Decoding audio…
          </p>
        )}
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={`${source.file.name} · ${formatBytes(source.file.size)} · ${formatDuration(
          source.buffer.duration,
        )}`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New file
          </Button>
        }
        bodyClassName="flex flex-col gap-4 p-4"
      >
        <audio
          controls
          src={source.url}
          className="w-full"
          aria-label="Original audio preview"
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="volume">Volume</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {percent}%
            </span>
          </div>
          <Slider
            id="volume"
            min={0}
            max={400}
            step={5}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            aria-label="Volume level in percent"
          />
          <p className="text-[11px] text-muted-foreground">
            100% keeps the original level; above 100% amplifies and may clip.
          </p>
        </div>
      </Panel>

      <Button onClick={() => void apply()} disabled={running}>
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Volume2 className="h-4 w-4" aria-hidden />
        )}
        Apply &amp; download
      </Button>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="change-audio-volume">
      <ChangeAudioVolumeClient />
    </ToolPage>
  );
}
