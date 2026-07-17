import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Combine,
  Download,
  Film,
  GripVertical,
  Loader2,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";
import { useFfmpeg } from "../_shared/use-ffmpeg";
import { EngineStatus } from "../_shared/engine-status";

interface Item {
  id: string;
  file: File;
}

let counter = 0;
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `v-${++counter}`;

function ext(file: File): string {
  return /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "mp4";
}

export function MergeVideosClient() {
  const { state, loadPercent, runPercent, setRunPercent, ensureLoaded } = useFfmpeg();
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const addFiles = useCallback((files: File[]) => {
    const vids = files.filter((f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(f.name));
    if (vids.length === 0) {
      setError("Those files aren't videos.");
      return;
    }
    setError(null);
    setItems((prev) => [...prev, ...vids.map((file) => ({ id: nextId(), file }))]);
    void ensureLoaded().catch(() => {});
  }, [ensureLoaded]);

  const remove = useCallback((id: string) => setItems((p) => p.filter((it) => it.id !== id)), []);
  const move = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    if (items.length < 2 || running) return;
    setRunning(true);
    setRunPercent(0);
    setError(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);

    const names = items.map((it, i) => `in_${i}.${ext(it.file)}`);
    let ff: Awaited<ReturnType<typeof ensureLoaded>> | null = null;
    try {
      ff = await ensureLoaded();
      const { fetchFile } = await import("@ffmpeg/util");
      for (let i = 0; i < items.length; i++) {
        await ff.writeFile(names[i], await fetchFile(items[i].file));
      }
      const list = names.map((n) => `file '${n}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(list));

      const code = await ff.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "list.txt",
        "-c", "copy",
        "output.mp4",
      ]);
      if (code !== 0) throw new Error("ffmpeg failed");
      const data = await ff.readFile("output.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      if (blob.size === 0) throw new Error("empty");
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ url, size: blob.size, name: "merged.mp4" });
      setRunPercent(100);
    } catch {
      setError(
        "Merge failed. Fast concatenation needs every clip in the same format (codec, resolution, frame rate). Run each clip through Video Converter or Resize Video first, then merge.",
      );
    } finally {
      if (ff) {
        for (const n of names) {
          try { await ff.deleteFile(n); } catch {}
        }
        try { await ff.deleteFile("list.txt"); } catch {}
        try { await ff.deleteFile("output.mp4"); } catch {}
      }
      setRunning(false);
    }
  }, [items, running, ensureLoaded, setRunPercent]);

  const reset = useCallback(() => {
    setItems([]);
    setResult(null);
    setError(null);
  }, []);

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <FileDropzone accept="video/*" multiple onFiles={addFiles} hint="Drop two or more clips. Reorder, then merge into one video." />
        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const totalSize = items.reduce((s, it) => s + it.file.size, 0);

  return (
    <div className="space-y-4">
      <Panel
        title={`${items.length} clip${items.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}`}
        actions={<Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Clear</Button>}
        bodyClassName="p-3"
      >
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== index) move(dragIndex, index); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)}
              className={cn("flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2", dragIndex === index ? "border-accent opacity-60" : "border-border")}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">{index + 1}</span>
              <Film className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" disabled={index === items.length - 1} onClick={() => move(index, index + 1)}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger" aria-label="Remove" onClick={() => remove(item.id)}><X className="h-4 w-4" aria-hidden /></Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <FileDropzone accept="video/*" multiple onFiles={addFiles} className="border-border/70 px-4 py-6" hint="Add more clips" />
        </div>
      </Panel>

      <EngineStatus state={state} loadPercent={loadPercent} onRetry={() => void ensureLoaded().catch(() => {})} />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={items.length < 2 || running || state === "error"}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Combine className="h-4 w-4" aria-hidden />}
          Merge {items.length} clips
        </Button>
        {running && (
          <span className="text-xs text-muted-foreground">
            {state === "ready" ? `Merging ${runPercent}%` : `Waiting for engine (${loadPercent}%)`}
          </span>
        )}
        {items.length < 2 && <span className="text-xs text-muted-foreground">Add at least two clips.</span>}
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
        Fast, lossless concatenation copies the streams without re-encoding, so
        clips must share the same codec, resolution, and frame rate — easiest
        when they come from the same source or camera.
      </p>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="merge-videos">
      <MergeVideosClient />
    </ToolPage>
  );
}
