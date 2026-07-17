import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Layers, Loader2, Music, RotateCcw, X } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";
import { audioBufferToWav, decodeAudioFile, formatDuration } from "@/lib/audio";

interface Track {
  id: string;
  file: File;
  buffer: AudioBuffer;
  /** Playback level in percent, 0–200. */
  volume: number;
  /** Start offset in seconds, kept as text so partial input ("1.") is typable. */
  offsetText: string;
}

interface MixResult {
  blob: Blob;
  url: string;
  duration: number;
}

let counter = 0;
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${++counter}`;

const parseOffset = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function AudioMixerClient() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [decoding, setDecoding] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
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

  const addFiles = useCallback(
    async (files: File[]) => {
      const audio = files.filter(
        (f) =>
          f.type.startsWith("audio/") ||
          /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm)$/i.test(f.name),
      );
      if (audio.length === 0) {
        setError("Those files aren't audio.");
        return;
      }
      setError(null);
      setDecoding(true);
      try {
        const decoded = await Promise.all(
          audio.map(async (file) => ({ file, buffer: await decodeAudioFile(file) })),
        );
        clearResult();
        setTracks((prev) => [
          ...prev,
          ...decoded.map(({ file, buffer }) => ({
            id: nextId(),
            file,
            buffer,
            volume: 100,
            offsetText: "0",
          })),
        ]);
      } catch {
        setError("Could not decode one of those files. Try a different audio format.");
      } finally {
        setDecoding(false);
      }
    },
    [clearResult],
  );

  const updateTrack = useCallback(
    (id: string, patch: Partial<Pick<Track, "volume" | "offsetText">>) => {
      clearResult();
      setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [clearResult],
  );

  const removeTrack = useCallback(
    (id: string) => {
      clearResult();
      setTracks((prev) => prev.filter((t) => t.id !== id));
    },
    [clearResult],
  );

  const reset = useCallback(() => {
    clearResult();
    setTracks([]);
    setError(null);
  }, [clearResult]);

  const mixDuration = useMemo(
    () =>
      tracks.reduce(
        (max, t) => Math.max(max, t.buffer.duration + parseOffset(t.offsetText)),
        0,
      ),
    [tracks],
  );

  const mix = useCallback(async () => {
    if (tracks.length < 2 || running) return;
    setRunning(true);
    setError(null);
    try {
      const sampleRate = tracks[0].buffer.sampleRate;
      const channels = Math.min(
        2,
        tracks.reduce((m, t) => Math.max(m, t.buffer.numberOfChannels), 1),
      );
      const lengthSec = tracks.reduce(
        (max, t) => Math.max(max, t.buffer.duration + parseOffset(t.offsetText)),
        0,
      );
      const frames = Math.max(1, Math.ceil(lengthSec * sampleRate));
      const offline = new OfflineAudioContext(channels, frames, sampleRate);

      for (const t of tracks) {
        const source = offline.createBufferSource();
        source.buffer = t.buffer;
        const gain = offline.createGain();
        gain.gain.value = t.volume / 100;
        source.connect(gain);
        gain.connect(offline.destination);
        source.start(parseOffset(t.offsetText));
      }

      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);
      clearResult();
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ blob, url, duration: rendered.duration });
    } catch {
      setError("Something went wrong while mixing. Try removing a track and mixing again.");
    } finally {
      setRunning(false);
    }
  }, [tracks, running, clearResult]);

  const save = useCallback(() => {
    if (result) downloadBlob(result.blob, "mix.wav");
  }, [result]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (tracks.length === 0) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="audio/*"
          multiple
          onFiles={(files) => void addFiles(files)}
          hint="Drop two or more clips. They play together — set each track's volume and start time, then mix into one WAV."
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
        title={`${tracks.length} track${tracks.length === 1 ? "" : "s"} · mix length ${formatDuration(mixDuration)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        }
        bodyClassName="flex flex-col gap-3 p-3"
      >
        {tracks.map((track, index) => (
          <div
            key={track.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {track.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(track.file.size)} · {formatDuration(track.buffer.duration)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger"
                aria-label={`Remove ${track.file.name}`}
                onClick={() => removeTrack(track.id)}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`vol-${track.id}`}>Volume</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {track.volume}%
                </span>
              </div>
              <Slider
                id={`vol-${track.id}`}
                min={0}
                max={200}
                step={5}
                value={track.volume}
                onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                aria-label={`Volume for ${track.file.name} in percent`}
              />
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor={`off-${track.id}`} className="shrink-0">
                Starts at
              </Label>
              <Input
                id={`off-${track.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={track.offsetText}
                onChange={(e) => updateTrack(track.id, { offsetText: e.target.value })}
                className="h-10 w-24 text-right tabular-nums"
                aria-label={`Start offset in seconds for ${track.file.name}`}
              />
              <span className="text-xs text-muted-foreground">seconds into the mix</span>
            </div>
          </div>
        ))}

        <FileDropzone
          accept="audio/*"
          multiple
          onFiles={(files) => void addFiles(files)}
          className="border-border/70 px-4 py-6"
          hint="Add more tracks"
        />
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="h-12 px-5"
          onClick={() => void mix()}
          disabled={tracks.length < 2 || running || decoding}
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Layers className="h-4 w-4" aria-hidden />
          )}
          Mix {tracks.length} tracks
        </Button>
        {tracks.length < 2 && (
          <span className="text-xs text-muted-foreground">
            Add at least two tracks to mix.
          </span>
        )}
      </div>

      {result && (
        <Panel title={`Mixed result · ${formatDuration(result.duration)}`} bodyClassName="flex flex-col gap-3 p-4">
          <audio controls src={result.url} className="w-full" aria-label="Mixed audio preview" />
          <Button className="h-12 self-start px-5" onClick={save}>
            <Download className="h-4 w-4" aria-hidden />
            Save WAV
          </Button>
        </Panel>
      )}

      <p className="text-xs text-muted-foreground">
        Tracks are overlaid at the first file&apos;s sample rate; others are resampled to match.
        Volumes above 100% amplify and the summed mix may clip.
      </p>

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

export default function Screen() {
  return (
    <ToolPage slug="audio-mixer">
      <AudioMixerClient />
    </ToolPage>
  );
}
