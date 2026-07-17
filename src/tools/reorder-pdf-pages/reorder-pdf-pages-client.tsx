import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
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

export function ReorderPdfPagesClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState<number | null>(null);

  // Thumbs are indexed by ORIGINAL page index; `order` holds original indices
  // in their current display order.
  const [thumbs, setThumbs] = useState<(Thumb | null)[]>([]);
  const [order, setOrder] = useState<number[]>([]);

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
    setOrder([]);
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
        setOrder(Array.from({ length: doc.numPages }, (_, i) => i));
        setThumbs(new Array<Thumb | null>(doc.numPages).fill(null));
        setLoading(false);

        for (let i = 1; i <= doc.numPages; i++) {
          if (genRef.current !== gen) {
            void doc.destroy();
            return;
          }
          setRenderingPage(i);
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 200 / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
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
            ? "This PDF is password protected. Unlock it first, then reorder."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const move = useCallback((position: number, delta: -1 | 1) => {
    setOrder((prev) => {
      const target = position + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[position], next[target]] = [next[target], next[position]];
      return next;
    });
  }, []);

  const resetOrder = useCallback(() => {
    setOrder(Array.from({ length: pageCount }, (_, i) => i));
  }, [pageCount]);

  const reverseOrder = useCallback(() => {
    setOrder((prev) => prev.slice().reverse());
  }, []);

  const save = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || saving || order.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const gen = genRef.current;

    try {
      const { PDFDocument } = await import("pdf-lib");
      // pdf-lib gets its own copy of the bytes as well.
      const src = await PDFDocument.load(buffer.slice(0), {
        ignoreEncryption: true,
      });
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, order);
      for (const page of pages) out.addPage(page);
      const bytes = await out.save();
      if (genRef.current !== gen) return;

      const baseName =
        (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${baseName}-reordered.pdf`,
      );
    } catch {
      setSaveError(
        "Could not rebuild this PDF. It may be encrypted or corrupted.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, order, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Move pages up or down, then export the new order."
        />
      </Panel>
    );
  }

  const changed = order.some((orig, pos) => orig !== pos);

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
          <Panel bodyClassName="flex flex-wrap items-center gap-2 p-3">
            <Button variant="secondary" size="sm" onClick={reverseOrder}>
              Reverse order
            </Button>
            {changed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetOrder}
                className="ml-auto"
              >
                Reset order
              </Button>
            )}
          </Panel>

          {/* Ordered page list */}
          <Panel title="Pages (top = first)" bodyClassName="flex flex-col gap-2 p-3">
            {order.map((orig, pos) => {
              const thumb = thumbs[orig];
              const moved = orig !== pos;
              return (
                <div
                  key={orig}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-card p-2",
                    moved ? "border-accent/60" : "border-border",
                  )}
                >
                  <span className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {thumb ? (
                      <img
                        src={thumb.dataUrl}
                        alt={`Original page ${orig + 1}`}
                        className="max-h-full max-w-full rounded-sm border border-border"
                        draggable={false}
                      />
                    ) : (
                      <span
                        className="w-10 animate-pulse rounded-sm bg-border/60"
                        style={{ aspectRatio: `${DEFAULT_ASPECT}` }}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      Position {pos + 1}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Original page {orig + 1}
                      {moved && <span className="ml-1 text-accent">· moved</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-12 w-12"
                      aria-label={`Move position ${pos + 1} up`}
                      disabled={pos === 0}
                      onClick={() => move(pos, -1)}
                    >
                      <ArrowUp className="h-5 w-5" aria-hidden />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-12 w-12"
                      aria-label={`Move position ${pos + 1} down`}
                      disabled={pos === order.length - 1}
                      onClick={() => move(pos, 1)}
                    >
                      <ArrowDown className="h-5 w-5" aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
          </Panel>

          {/* Export */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void save()}
              disabled={saving || !changed}
              className="h-12 px-5"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Download reordered PDF
            </Button>
            {!changed && (
              <span className="text-xs text-muted-foreground">
                Move at least one page to enable the download.
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
    <ToolPage slug="reorder-pdf-pages">
      <ReorderPdfPagesClient />
    </ToolPage>
  );
}
