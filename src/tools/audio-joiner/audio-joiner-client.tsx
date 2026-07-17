import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Combine,
  GripVertical,
  Loader2,
  Music,
  RotateCcw,
  X,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";
import { audioBufferToWav, decodeAudioFile, getAudioContext } from "@/lib/audio";

interface Item {
  id: string;
  file: File;
}

let counter = 0;
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `a-${++counter}`;

export function AudioJoinerClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((files: File[]) => {
    const audio = files.filter(
      (f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm)$/i.test(f.name),
    );
    if (audio.length === 0) {
      setError("Those files aren't audio.");
      return;
    }
    setError(null);
    setItems((prev) => [...prev, ...audio.map((file) => ({ id: nextId(), file }))]);
  }, []);

  const remove = useCallback(
    (id: string) => setItems((p) => p.filter((it) => it.id !== id)),
    [],
  );

  const move = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setError(null);
  }, []);

  const join = useCallback(async () => {
    if (items.length < 2 || running) return;
    setRunning(true);
    setError(null);
    try {
      const buffers = await Promise.all(items.map((it) => decodeAudioFile(it.file)));

      const sampleRate = buffers[0].sampleRate;
      const channels = buffers.reduce((m, b) => Math.max(m, b.numberOfChannels), 1);
      const totalFrames = buffers.reduce((sum, b) => sum + b.length, 0);

      const ctx = getAudioContext();
      const out = ctx.createBuffer(channels, totalFrames, sampleRate);

      let offset = 0;
      for (const b of buffers) {
        for (let c = 0; c < channels; c++) {
          // Fall back to the source's channel 0 when it has fewer channels.
          const srcChannel = c < b.numberOfChannels ? c : 0;
          out.getChannelData(c).set(b.getChannelData(srcChannel), offset);
        }
        offset += b.length;
      }

      const blob = audioBufferToWav(out);
      downloadBlob(blob, "joined.wav");
    } catch {
      setError("Could not join these files. One of them may be an unsupported audio format.");
    } finally {
      setRunning(false);
    }
  }, [items, running]);

  const totalSize = useMemo(() => items.reduce((s, it) => s + it.file.size, 0), [items]);

  // Warn when files carry a different apparent sample rate hint (best-effort by
  // name is not possible pre-decode, so we surface a general caveat instead).
  const showRateWarning = items.length >= 2;

  // ── Empty state ──────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="audio/*"
          multiple
          onFiles={addFiles}
          hint="Drop two or more clips. Reorder, then join them into one WAV."
        />
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
        title={`${items.length} clip${items.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        }
        bodyClassName="p-3"
      >
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== index) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2",
                dragIndex === index ? "border-accent opacity-60" : "border-border",
              )}
            >
              <GripVertical
                className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden
              />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-danger"
                  aria-label="Remove"
                  onClick={() => remove(item.id)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <FileDropzone
            accept="audio/*"
            multiple
            onFiles={addFiles}
            className="border-border/70 px-4 py-6"
            hint="Add more clips"
          />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void join()} disabled={items.length < 2 || running}>
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Combine className="h-4 w-4" aria-hidden />
          )}
          Join {items.length} clips
        </Button>
        {items.length < 2 && (
          <span className="text-xs text-muted-foreground">Add at least two clips to join.</span>
        )}
      </div>

      {showRateWarning && (
        <p className="text-xs text-muted-foreground">
          Clips are joined at the first file&apos;s sample rate and are assumed to share it. If your
          files use different sample rates, the joined result may play back at the wrong speed —
          convert them to a common rate first.
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
    <ToolPage slug="audio-joiner">
      <AudioJoinerClient />
    </ToolPage>
  );
}
