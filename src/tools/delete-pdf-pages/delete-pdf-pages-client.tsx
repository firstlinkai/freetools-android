import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface Thumb {
  dataUrl: string;
  aspect: number; // width / height
}

/** Fallback A4 portrait aspect for skeleton placeholders. */
const DEFAULT_ASPECT = 210 / 297;

export function DeletePdfPagesClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState<number | null>(null);

  const [thumbs, setThumbs] = useState<(Thumb | null)[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Original file bytes, read once. pdfjs and pdf-lib each get their own copy
  // because pdfjs transfers (detaches) the buffer it receives.
  const bufferRef = useRef<ArrayBuffer | null>(null);
  // Bumped on reset / new file so an in-flight render loop stops cleanly.
  const genRef = useRef(0);

  useEffect(
    () => () => {
      genRef.current++;
      bufferRef.current = null;
    },
    [],
  );

  const reset = useCallback(() => {
    genRef.current++;
    bufferRef.current = null;
    setFileName(null);
    setFileSize(0);
    setPageCount(0);
    setLoading(false);
    setLoadError(null);
    setRenderingPage(null);
    setThumbs([]);
    setMarked(new Set());
    setSaving(false);
    setSaveError(null);
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      reset();
      setLoading(true);
      setFileName(file.name);
      setFileSize(file.size);
      const gen = ++genRef.current;

      try {
        const buffer = await file.arrayBuffer();
        if (genRef.current !== gen) return;
        bufferRef.current = buffer;

        const pdfjs = await loadPdfjs();
        // pdfjs detaches the buffer it is given, so hand it a copy.
        const doc = await pdfjs.getDocument({
          data: new Uint8Array(buffer.slice(0)),
        }).promise;
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }

        setPageCount(doc.numPages);
        setThumbs(new Array<Thumb | null>(doc.numPages).fill(null));
        setLoading(false);

        // Render thumbnails one page at a time to keep memory in check.
        for (let i = 1; i <= doc.numPages; i++) {
          if (genRef.current !== gen) {
            void doc.destroy();
            return;
          }
          setRenderingPage(i);
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 320 / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          const aspect = base.width / base.height;
          page.cleanup();
          if (genRef.current !== gen) {
            void doc.destroy();
            return;
          }
          setThumbs((prev) => {
            const next = prev.slice();
            next[i - 1] = { dataUrl, aspect };
            return next;
          });
        }
        setRenderingPage(null);
        void doc.destroy();
      } catch (err) {
        if (genRef.current !== gen) return;
        const name = (err as { name?: string } | null)?.name;
        setLoading(false);
        setRenderingPage(null);
        setLoadError(
          name === "PasswordException"
            ? "This PDF is password protected. Unlock it first, then delete pages."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const toggle = useCallback((index: number) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const clearMarks = useCallback(() => setMarked(new Set()), []);

  const invertMarks = useCallback(() => {
    setMarked((prev) => {
      const next = new Set<number>();
      for (let i = 0; i < pageCount; i++) if (!prev.has(i)) next.add(i);
      return next;
    });
  }, [pageCount]);

  const save = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || saving || marked.size === 0 || marked.size >= pageCount) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    const gen = genRef.current;

    try {
      const { PDFDocument } = await import("pdf-lib");
      // pdf-lib gets its own copy of the bytes as well.
      const src = await PDFDocument.load(buffer.slice(0), {
        ignoreEncryption: true,
      });
      const kept: number[] = [];
      for (let i = 0; i < pageCount; i++) if (!marked.has(i)) kept.push(i);

      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, kept);
      for (const page of pages) out.addPage(page);
      const bytes = await out.save();
      if (genRef.current !== gen) return;

      const baseName =
        (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${baseName}-trimmed.pdf`,
      );
    } catch {
      setSaveError(
        "Could not rebuild this PDF. It may be encrypted or corrupted.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, marked, pageCount, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Tap the pages you want to remove, then export the rest."
        />
      </Panel>
    );
  }

  const keptCount = pageCount - marked.size;
  const allMarked = pageCount > 0 && marked.size >= pageCount;

  return (
    <div className="flex flex-col gap-4">
      {/* File info bar */}
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Reading file"
              : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
            {" · "}
            {formatBytes(fileSize)}
          </p>
        </div>
        {renderingPage !== null && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Rendering {renderingPage}/{pageCount}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {loadError && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
          {loadError}
        </div>
      )}

      {!loadError && !loading && pageCount > 0 && (
        <>
          {/* Mark controls */}
          <Panel bodyClassName="flex flex-wrap items-center gap-2 p-3">
            <Button variant="secondary" size="sm" onClick={clearMarks}>
              Clear
            </Button>
            <Button variant="secondary" size="sm" onClick={invertMarks}>
              Invert
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {marked.size} marked · {keptCount} kept
            </span>
          </Panel>

          {/* Thumbnail grid */}
          <Panel title="Tap pages to delete" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {thumbs.map((thumb, i) => {
                const isMarked = marked.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={isMarked}
                    aria-label={`Page ${i + 1}${isMarked ? ", marked for deletion" : ""}`}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isMarked
                        ? "border-danger ring-2 ring-danger"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <span className="flex w-full items-center justify-center bg-muted p-2">
                      {thumb ? (
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${i + 1}`}
                          className={cn(
                            "h-auto max-w-full rounded-sm border border-border shadow-sm transition-opacity",
                            isMarked && "opacity-40 grayscale",
                          )}
                          style={{ aspectRatio: `${thumb.aspect}` }}
                          draggable={false}
                        />
                      ) : (
                        <span
                          className="w-full animate-pulse rounded-sm bg-border/60"
                          style={{ aspectRatio: `${DEFAULT_ASPECT}` }}
                        />
                      )}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-1.5 text-center text-xs",
                        isMarked
                          ? "text-danger line-through"
                          : "text-muted-foreground",
                      )}
                    >
                      Page {i + 1}
                    </span>
                    {isMarked && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-sm">
                        <X className="h-3 w-3" aria-hidden />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Export */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void save()}
              disabled={saving || marked.size === 0 || allMarked}
              className="h-12 px-5"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              Delete {marked.size > 0 ? `${marked.size} ` : ""}
              {marked.size === 1 ? "page" : "pages"} &amp; export
            </Button>
            {marked.size === 0 && (
              <span className="text-xs text-muted-foreground">
                Mark at least one page to enable the export.
              </span>
            )}
            {allMarked && (
              <span className="text-xs text-danger">
                You cannot delete every page — the PDF would be empty.
              </span>
            )}
          </div>

          {saveError && (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
              {saveError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="delete-pdf-pages">
      <DeletePdfPagesClient />
    </ToolPage>
  );
}
