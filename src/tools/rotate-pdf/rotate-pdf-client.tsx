import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Loader2,
  RotateCcw,
  RotateCw,
  RotateCcw as RotateLeft,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface Thumb {
  dataUrl: string;
  aspect: number;
}

const DEFAULT_ASPECT = 210 / 297;

export function RotatePdfClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState<number | null>(null);

  const [thumbs, setThumbs] = useState<(Thumb | null)[]>([]);
  const [rotations, setRotations] = useState<number[]>([]); // added degrees per page

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const bufferRef = useRef<ArrayBuffer | null>(null);
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
    setRotations([]);
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
        const doc = await pdfjs.getDocument({
          data: new Uint8Array(buffer.slice(0)),
        }).promise;
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }

        setPageCount(doc.numPages);
        setRotations(new Array(doc.numPages).fill(0));
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
          const viewport = page.getViewport({ scale: 260 / base.width });
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
            ? "This PDF is password protected. Unlock it first, then rotate."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const rotatePage = useCallback((index: number, delta: number) => {
    setRotations((prev) => {
      const next = prev.slice();
      next[index] = (((next[index] + delta) % 360) + 360) % 360;
      return next;
    });
  }, []);

  const rotateAll = useCallback((delta: number) => {
    setRotations((prev) => prev.map((r) => (((r + delta) % 360) + 360) % 360));
  }, []);

  const save = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || saving) return;
    setSaving(true);
    setSaveError(null);
    const gen = genRef.current;

    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const doc = await PDFDocument.load(buffer.slice(0), {
        ignoreEncryption: true,
      });
      const pages = doc.getPages();
      pages.forEach((page, i) => {
        const added = rotations[i] ?? 0;
        if (added === 0) return;
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + added) % 360));
      });
      const bytes = await doc.save();
      if (genRef.current !== gen) return;
      const baseName = (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${baseName}-rotated.pdf`,
      );
    } catch {
      setSaveError("Could not rotate this PDF. It may be encrypted or corrupted.");
    } finally {
      setSaving(false);
    }
  }, [saving, rotations, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Rotate individual pages or the whole document."
        />
      </Panel>
    );
  }

  const changed = rotations.some((r) => r !== 0);

  return (
    <div className="flex flex-col gap-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {loading ? "Reading file" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
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
            <span className="text-xs font-medium text-muted-foreground">
              Rotate every page:
            </span>
            <Button variant="secondary" size="sm" onClick={() => rotateAll(-90)}>
              <RotateLeft className="h-3.5 w-3.5" aria-hidden />
              Left
            </Button>
            <Button variant="secondary" size="sm" onClick={() => rotateAll(90)}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Right
            </Button>
            {changed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRotations((prev) => prev.map(() => 0))}
                className="ml-auto"
              >
                Reset rotations
              </Button>
            )}
          </Panel>

          <Panel title="Pages" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {thumbs.map((thumb, i) => (
                <div
                  key={i}
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                >
                  <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted p-2">
                    {thumb ? (
                      <img
                        src={thumb.dataUrl}
                        alt={`Page ${i + 1}`}
                        className="max-h-full max-w-full rounded-sm border border-border shadow-sm transition-transform duration-200"
                        style={{ transform: `rotate(${rotations[i] ?? 0}deg)` }}
                        draggable={false}
                      />
                    ) : (
                      <span
                        className="w-full animate-pulse rounded-sm bg-border/60"
                        style={{ aspectRatio: `${DEFAULT_ASPECT}` }}
                      />
                    )}
                  </span>
                  <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
                    <span className="text-xs text-muted-foreground">
                      {i + 1}
                      {rotations[i] ? (
                        <span className="ml-1 text-accent">{rotations[i]}°</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Rotate page ${i + 1} left`}
                        onClick={() => rotatePage(i, -90)}
                      >
                        <RotateLeft className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Rotate page ${i + 1} right`}
                        onClick={() => rotatePage(i, 90)}
                      >
                        <RotateCw className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={saving || !changed}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Download rotated PDF
            </Button>
            {!changed && (
              <span className="text-xs text-muted-foreground">
                Rotate at least one page to enable the download.
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
    <ToolPage slug="rotate-pdf">
      <RotatePdfClient />
    </ToolPage>
  );
}
