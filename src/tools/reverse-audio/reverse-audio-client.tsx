import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Repeat } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import {
  audioBufferToWav,
  decodeAudioFile,
  formatDuration,
  getAudioContext,
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

/** Build a new AudioBuffer whose every channel is the source reversed. */
function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const { numberOfChannels, length, sampleRate } = buffer;
  const out = getAudioContext().createBuffer(numberOfChannels, length, sampleRate);
  for (let c = 0; c < numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < length; i++) {
      dst[i] = src[length - 1 - i];
    }
  }
  return out;
}

export function ReverseAudioClient() {
  const [source, setSource] = useState<Source | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const clearResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultUrl(null);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      if (!f.type.startsWith("audio/")) {
        setError("That file isn't audio. Drop an MP3, WAV, M4A, or OGG file.");
        return;
      }
      setError(null);
      setBusy(true);
      clearResult();
      try {
        const buffer = await decodeAudioFile(f);
        const url = URL.createObjectURL(f);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setSource({ file: f, buffer, duration: buffer.duration, url });
      } catch {
        setError("Could not decode that audio file. Try a different format.");
      } finally {
        setBusy(false);
      }
    },
    [clearResult],
  );

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    clearResult();
    setSource(null);
    setError(null);
    setBusy(false);
  }, [clearResult]);

  const reverse = useCallback(() => {
    if (!source) return;
    setError(null);
    setBusy(true);
    try {
      const reversed = reverseBuffer(source.buffer);
      const blob = audioBufferToWav(reversed);
      downloadBlob(blob, `${baseName(source.file.name)}-reversed.wav`);
      // Result preview from the WAV blob.
      const url = URL.createObjectURL(blob);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = url;
      setResultUrl(url);
    } catch {
      setError("Something went wrong while reversing. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [source]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="audio/*"
          onFiles={(files) => void handleFiles(files)}
          hint="MP3, WAV, M4A, or OGG. Reverse it and download the result as WAV."
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

      <Button onClick={reverse} disabled={busy}>
        <Repeat className="h-4 w-4" aria-hidden />
        Reverse &amp; download WAV
      </Button>

      {/* Reversed result preview */}
      {resultUrl && (
        <Panel title="Reversed (WAV)" bodyClassName="p-4">
          <audio src={resultUrl} controls className="w-full" />
        </Panel>
      )}

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
    <ToolPage slug="reverse-audio">
      <ReverseAudioClient />
    </ToolPage>
  );
}
