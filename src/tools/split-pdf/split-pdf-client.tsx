import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Loader2, RotateCcw, Scissors } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";
import { parsePageRanges } from "./parse-range";

interface Thumb {
  dataUrl: string;
  aspect: number; // width / height
}

type ExtractMode = "single" | "each";

/** Fallback A4 portrait aspect for skeleton placeholders. */
const DEFAULT_ASPECT = 210 / 297;

export function SplitPdfClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [thumbs, setThumbs] = useState<(Thumb | null)[]>([]);
  const [renderingPage, setRenderingPage] = useState<number | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  const [mode, setMode] = useState<ExtractMode>("single");
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Original file bytes, read once. pdfjs and pdf-lib each get their own copy
  // because pdfjs transfers (detaches) the buffer it receives.
  const bufferRef = useRef<ArrayBuffer | null>(null);
  // Bumped on reset / new file so an in-flight render loop stops cleanly.
  const genRef = useRef(0);

  useEffect(() => {
    return () => {
      genRef.current++;
      bufferRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    genRef.current++;
    bufferRef.current = null;
    setFileName(null);
    setFileSize(0);
    setPageCount(0);
    setLoading(false);
    setLoadError(null);
    setThumbs([]);
    setRenderingPage(null);
    setSelected(new Set());
    setRangeText("");
    setRangeError(null);
    setMode("single");
    setExtracting(false);
    setExtractStatus(null);
    setExtractError(null);
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

        // Dynamic import keeps pdfjs out of the SSR pass and the page bundle.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

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
          // Render at 2x the ~160px display width so thumbnails stay sharp.
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
            ? "This PDF is password protected. Remove the password and try again."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i)));
  }, [pageCount]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const invertSelection = useCallback(() => {
    setSelected((prev) => {
      const next = new Set<number>();
      for (let i = 0; i < pageCount; i++) if (!prev.has(i)) next.add(i);
      return next;
    });
  }, [pageCount]);

  const applyRange = useCallback(() => {
    const parsed = parsePageRanges(rangeText, pageCount);
    if ("error" in parsed) {
      setRangeError(parsed.error);
      return;
    }
    setRangeError(null);
    setSelected(new Set(parsed.pages));
  }, [rangeText, pageCount]);

  const extract = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || selected.size === 0 || extracting) return;

    setExtracting(true);
    setExtractError(null);
    const gen = genRef.current;

    try {
      const { PDFDocument } = await import("pdf-lib");
      setExtractStatus("Reading PDF");
      // pdf-lib gets its own copy of the bytes as well.
      const src = await PDFDocument.load(buffer.slice(0));
      const indices = Array.from(selected).sort((a, b) => a - b);
      const baseName =
        (fileName ?? "document").replace(/\.pdf$/i, "") || "document";

      if (mode === "single") {
        setExtractStatus("Building PDF");
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, indices);
        for (const page of pages) out.addPage(page);
        const bytes = await out.save();
        if (genRef.current !== gen) return;
        downloadBlob(
          new Blob([bytes as BlobPart], { type: "application/pdf" }),
          `${baseName}-pages.pdf`,
        );
      } else {
        for (let i = 0; i < indices.length; i++) {
          if (genRef.current !== gen) return;
          setExtractStatus(`Saving ${i + 1} of ${indices.length}`);
          const out = await PDFDocument.create();
          const [page] = await out.copyPages(src, [indices[i]]);
          out.addPage(page);
          const bytes = await out.save();
          downloadBlob(
            new Blob([bytes as BlobPart], { type: "application/pdf" }),
            `${baseName}-p${indices[i] + 1}.pdf`,
          );
          // Give the browser a beat between downloads so none get dropped.
          if (i < indices.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }
      }
    } catch {
      setExtractError(
        "Extraction failed. The PDF may be encrypted or corrupted.",
      );
    } finally {
      setExtracting(false);
      setExtractStatus(null);
    }
  }, [selected, extracting, fileName, mode]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Pages appear as thumbnails you can pick from."
        />
      </Panel>
    );
  }

  const renderedCount = thumbs.filter(Boolean).length;

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
            Rendering page {renderingPage} of {pageCount}
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
          {/* Selection controls */}
          <Panel title="Select pages" bodyClassName="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <Button variant="secondary" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button variant="secondary" size="sm" onClick={invertSelection}>
                Invert
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {selected.size} of {pageCount} pages selected
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page-range">Page range</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="page-range"
                  value={rangeText}
                  placeholder="e.g. 1-3, 5, 8-10"
                  onChange={(e) => {
                    setRangeText(e.target.value);
                    setRangeError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyRange();
                  }}
                  className="max-w-xs"
                />
                <Button variant="outline" size="sm" onClick={applyRange}>
                  Apply
                </Button>
              </div>
              {rangeError && (
                <p className="text-xs text-danger">{rangeError}</p>
              )}
            </div>
          </Panel>

          {/* Thumbnail grid */}
          <Panel title="Pages" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {thumbs.map((thumb, i) => {
                const isSelected = selected.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={isSelected}
                    aria-label={`Page ${i + 1}${isSelected ? ", selected" : ""}`}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "border-accent ring-2 ring-accent"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <span className="flex w-full items-center justify-center bg-muted p-2">
                      {thumb ? (
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${i + 1}`}
                          className="h-auto max-w-full rounded-sm border border-border shadow-sm"
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
                    <span className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                      Page {i + 1}
                    </span>
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {renderedCount < pageCount && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Rendering page {renderingPage ?? renderedCount + 1} of{" "}
                {pageCount}
              </p>
            )}
          </Panel>

          {/* Extract controls */}
          <Panel title="Extract" bodyClassName="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-mode">Output</Label>
              <Select
                id="extract-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ExtractMode)}
                className="max-w-xs"
              >
                <option value="single">One PDF with selected pages</option>
                <option value="each">Each selected page as its own PDF</option>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void extract()}
                disabled={selected.size === 0 || extracting}
              >
                {extracting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Scissors className="h-4 w-4" aria-hidden />
                )}
                Extract pages
              </Button>
              {extractStatus && (
                <span className="text-xs text-muted-foreground">
                  {extractStatus}
                </span>
              )}
            </div>
            {extractError && (
              <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
                {extractError}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="split-pdf">
      <SplitPdfClient />
    </ToolPage>
  );
}
