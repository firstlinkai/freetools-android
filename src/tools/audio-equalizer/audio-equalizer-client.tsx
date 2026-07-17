import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  audioBufferToWav,
  decodeAudioFile,
  formatDuration,
  renderOffline,
} from "@/lib/audio";
import { downloadBlob } from "@/lib/download";

/** Fixed 5-band graphic EQ. Frequencies span sub-bass through air. */
const BANDS: { freq: number; label: string; short: string }[] = [
  { freq: 60, label: "Sub", short: "60Hz" },
  { freq: 230, label: "Bass", short: "230Hz" },
  { freq: 910, label: "Low mid", short: "910Hz" },
  { freq: 3600, label: "Presence", short: "3.6kHz" },
  { freq: 14000, label: "Air", short: "14kHz" },
];

const MIN_DB = -12;
const MAX_DB = 12;
const FLAT: number[] = BANDS.map(() => 0);

interface Source {
  file: File;
  buffer: AudioBuffer;
  url: string; // object URL backing the original preview
  base: string; // filename without extension
}

export function AudioEqualizerClient() {
  const [source, setSource] = useState<Source | null>(null);
  const [gains, setGains] = useState<number[]>(FLAT);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
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
    setLoading(true);
    try {
      const buffer = await decodeAudioFile(f);
      const url = URL.createObjectURL(f);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      const base = f.name.replace(/\.[^.]+$/, "") || "audio";
      setSource({ file: f, buffer, url, base });
      setGains(FLAT);
    } catch {
      setError("Could not decode that audio file. Try a different format.");
    } finally {
      setLoading(false);
    }
  }, []);

  const setBandGain = useCallback((index: number, value: number) => {
    setGains((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  const resetFlat = useCallback(() => setGains(FLAT), []);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSource(null);
    setGains(FLAT);
    setError(null);
  }, []);

  const apply = useCallback(async () => {
    if (!source) return;
    setError(null);
    setRendering(true);
    try {
      const rendered = await renderOffline(source.buffer, (ctx, node) => {
        // Chain peaking filters in series: source → f1 → f2 → … → destination.
        let head: AudioNode = node;
        for (let i = 0; i < BANDS.length; i++) {
          const filter = ctx.createBiquadFilter();
          filter.type = "peaking";
          filter.frequency.value = BANDS[i].freq;
          filter.Q.value = 1;
          filter.gain.value = gains[i];
          head.connect(filter);
          head = filter;
        }
        head.connect(ctx.destination);
      });
      const blob = audioBufferToWav(rendered);
      downloadBlob(blob, `${source.base}-eq.wav`);
    } catch {
      setError("Something went wrong while applying the equalizer.");
    } finally {
      setRendering(false);
    }
  }, [source, gains]);

  const isFlat = gains.every((g) => g === 0);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="audio/*"
          onFiles={(files) => void handleFiles(files)}
          hint="MP3, WAV, M4A, or OGG. Shape it with a 5-band graphic EQ."
        />
        {loading && (
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
      {/* Original preview */}
      <Panel
        title="Original"
        actions={
          <div className="flex items-center gap-1.5">
            <Badge>{formatDuration(source.buffer.duration)}</Badge>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              New file
            </Button>
          </div>
        }
        bodyClassName="p-4"
      >
        <audio src={source.url} controls className="w-full" />
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {source.file.name}
        </p>
      </Panel>

      {/* Equalizer bands */}
      <Panel
        title="Equalizer"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFlat}
            disabled={isFlat}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Reset to flat
          </Button>
        }
        bodyClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {BANDS.map((band, i) => (
            <div
              key={band.freq}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`band-${band.freq}`}>{band.short}</Label>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {gains[i] > 0 ? `+${gains[i]}` : gains[i]} dB
                </span>
              </div>
              <Slider
                id={`band-${band.freq}`}
                min={MIN_DB}
                max={MAX_DB}
                step={1}
                value={gains[i]}
                onChange={(e) => setBandGain(i, Number(e.target.value))}
                aria-label={`${band.short} ${band.label} gain`}
              />
              <span className="text-[11px] text-muted-foreground">
                {band.label}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Button size="lg" onClick={() => void apply()} disabled={rendering}>
        {rendering ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {rendering ? "Rendering…" : "Apply EQ & download"}
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
    <ToolPage slug="audio-equalizer">
      <AudioEqualizerClient />
    </ToolPage>
  );
}
