import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Combine,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";

interface PdfItem {
  id: string;
  file: File;
  /** null while the page count is still being read. */
  pageCount: number | null;
  /** Set when the file could not be parsed as a PDF. */
  error?: string;
}

let idCounter = 0;
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pdf-${++idCounter}`;

export function MergePdfClient() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Bumped on reset so an in-flight page-count read for a stale file is ignored.
  const genRef = useRef(0);

  const addFiles = useCallback((files: File[]) => {
    const pdfs = files.filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    if (pdfs.length === 0) {
      setError("Those files aren't PDFs. Drop one or more .pdf files.");
      return;
    }
    setError(null);

    const gen = genRef.current;
    const added: PdfItem[] = pdfs.map((file) => ({
      id: nextId(),
      file,
      pageCount: null,
    }));
    setItems((prev) => [...prev, ...added]);

    // Read each page count off the main path so the list appears instantly.
    void (async () => {
      const { PDFDocument } = await import("pdf-lib");
      for (const item of added) {
        let patch: Partial<PdfItem>;
        try {
          const bytes = await item.file.arrayBuffer();
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          patch = { pageCount: doc.getPageCount() };
        } catch {
          patch = { pageCount: 0, error: "Unreadable or encrypted PDF" };
        }
        if (genRef.current !== gen) return;
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, ...patch } : it)),
        );
      }
    })();
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    genRef.current++;
    setItems([]);
    setError(null);
    setMerging(false);
  }, []);

  const merge = useCallback(async () => {
    const usable = items.filter((it) => !it.error && it.pageCount !== null);
    if (usable.length < 2) return;

    setMerging(true);
    setError(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();

      for (const item of usable) {
        const bytes = await item.file.arrayBuffer();
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const page of pages) out.addPage(page);
      }

      // Merged bytes live only in browser memory until the download fires.
      const merged: Uint8Array = await out.save();
      downloadBlob(
        new Blob([merged as BlobPart], { type: "application/pdf" }),
        "merged.pdf",
      );
    } catch {
      setError(
        "Merge failed. One of the PDFs may be encrypted or corrupted — remove it and try again.",
      );
    } finally {
      setMerging(false);
    }
  }, [items]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="application/pdf,.pdf"
          multiple
          onFiles={addFiles}
          hint="Select two or more PDFs. Reorder them, then merge into a single file."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const usableCount = items.filter(
    (it) => !it.error && it.pageCount !== null,
  ).length;
  const totalPages = items.reduce((sum, it) => sum + (it.pageCount ?? 0), 0);
  const totalSize = items.reduce((sum, it) => sum + it.file.size, 0);
  const stillReading = items.some((it) => it.pageCount === null);

  return (
    <div className="space-y-4">
      <Panel
        title={`${items.length} file${items.length === 1 ? "" : "s"} · ${totalPages} page${
          totalPages === 1 ? "" : "s"
        } · ${formatBytes(totalSize)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Start over
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
                if (dragIndex !== null && dragIndex !== index) {
                  move(dragIndex, index);
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 transition-colors",
                dragIndex === index
                  ? "border-accent opacity-60"
                  : "border-border",
                item.error && "border-danger/40",
              )}
            >
              <GripVertical
                className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden
              />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  item.error ? "bg-danger/10" : "bg-muted",
                )}
              >
                {item.error ? (
                  <AlertCircle className="h-4 w-4 text-danger" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.error ? (
                    <span className="text-danger">{item.error}</span>
                  ) : item.pageCount === null ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      Reading
                    </span>
                  ) : (
                    `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`
                  )}
                  {" · "}
                  {formatBytes(item.file.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Move ${item.file.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Move ${item.file.name} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-danger"
                  aria-label={`Remove ${item.file.name}`}
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
            accept="application/pdf,.pdf"
            multiple
            onFiles={addFiles}
            className="border-border/70 px-4 py-6"
            hint="Add more PDFs to the merge"
          />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void merge()} disabled={usableCount < 2 || merging}>
          {merging ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Merging
            </>
          ) : (
            <>
              <Combine className="h-4 w-4" aria-hidden />
              Merge {usableCount} PDF{usableCount === 1 ? "" : "s"}
            </>
          )}
        </Button>
        {usableCount < 2 && !stillReading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add at least two valid PDFs to merge.
          </span>
        )}
      </div>

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
    <ToolPage slug="merge-pdf">
      <MergePdfClient />
    </ToolPage>
  );
}
