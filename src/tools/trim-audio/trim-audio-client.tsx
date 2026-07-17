import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Scissors } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  audioBufferToWav,
  decodeAudioFile,
  formatDuration,
  sliceAudioBuffer,
} from "@/lib/audio";
import { downloadBlob } from "@/lib/download";

interface Source {
  file: File;
  buffer: AudioBuffer;
  duration: number;
  url: string; // object URL backing the original <audio> preview
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "audio";
}

export function TrimAudioClient() {
  const [source, setSource] = useState<Source | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      const buffer = await decodeAudioFile(f);
      const url = URL.createObjectURL(f);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setSource({ file: f, buffer, duration: buffer.duration, url });
      setStart(0);
      setEnd(buffer.duration);
    } catch {
      setError("Could not decode that audio file. Try a different format.");
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSource(null);
    setStart(0);
    setEnd(0);
    setError(null);
    setBusy(false);
  }, []);

  // Keep start strictly before end (clamp against each other).
  const onStartChange = useCallback(
    (v: number) => {
      if (!source) return;
      setStart(Math.min(v, end - 0.01 < 0 ? 0 : end - 0.01));
    },
    [source, end],
  );
  const onEndChange = useCallback(
    (v: number) => {
      if (!source) return;
      setEnd(Math.max(v, start + 0.01));
    },
    [source, start],
  );

  const trim = useCallback(() => {
    if (!source) return;
    setError(null);
    try {
      const clip = sliceAudioBuffer(source.buffer, start, end);
      const blob = audioBufferToWav(clip);
      downloadBlob(blob, `${baseName(source.file.name)}-trimmed.wav`);
    } catch {
      setError("Something went wrong while trimming. Please try again.");
    }
  }, [source, start, end]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="audio/*"
          onFiles={(files) => void handleFiles(files)}
          hint="MP3, WAV, M4A, or OGG. Set a start and end, then download the clip as WAV."
        />
        {busy && (
          <p className="text-sm text-muted-foreground">Decoding audio…</p>
        )}
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const clipLength = Math.max(0, end - start);

  return (
    <div className="space-y-4">
      {/* Original preview */}
      <Panel
        title="Original"
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New file
          </Button>
        }
        bodyClassName="p-4"
      >
        <p className="mb-3 truncate text-sm text-muted-foreground">
          {source.file.name} · {formatDuration(source.duration)}
        </p>
        <audio src={source.url} controls className="w-full" />
      </Panel>

      {/* Trim controls */}
      <Panel title="Selection" bodyClassName="p-4">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="trim-start">Start</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(start)}
              </span>
            </div>
            <Slider
              id="trim-start"
              min={0}
              max={source.duration}
              step={0.01}
              value={start}
              onChange={(e) => onStartChange(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="trim-end">End</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(end)}
              </span>
            </div>
            <Slider
              id="trim-end"
              min={0}
              max={source.duration}
              step={0.01}
              value={end}
              onChange={(e) => onEndChange(Number(e.target.value))}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Clip length:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatDuration(clipLength)}
            </span>
          </p>
        </div>
      </Panel>

      <Button onClick={trim} disabled={clipLength <= 0}>
        <Scissors className="h-4 w-4" aria-hidden />
        Trim &amp; download WAV
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
    <ToolPage slug="trim-audio">
      <TrimAudioClient />
    </ToolPage>
  );
}
