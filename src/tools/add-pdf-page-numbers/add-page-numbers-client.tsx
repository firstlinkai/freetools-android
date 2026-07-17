import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

type Position =
  | "bottom-center"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "top-right"
  | "top-left";

type Format = "n" | "n-of-total" | "page-n";

const MARGIN = 32; // points from the page edge

function label(n: number, total: number, format: Format): string {
  if (format === "n-of-total") return `${n} / ${total}`;
  if (format === "page-n") return `Page ${n}`;
  return `${n}`;
}

/** Map a position to flexbox alignment for the HTML preview overlay. */
const ALIGN: Record<Position, string> = {
  "bottom-center": "items-end justify-center",
  "bottom-right": "items-end justify-end",
  "bottom-left": "items-end justify-start",
  "top-center": "items-start justify-center",
  "top-right": "items-start justify-end",
  "top-left": "items-start justify-start",
};

export function AddPageNumbersClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [position, setPosition] = useState<Position>("bottom-center");
  const [format, setFormat] = useState<Format>("n");
  const [startAt, setStartAt] = useState(1);
  const [fontSize, setFontSize] = useState(12);

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
    setPreview(null);
    setLoading(false);
    setLoadError(null);
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

        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 420 / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (genRef.current === gen) setPreview(canvas.toDataURL("image/jpeg", 0.82));
        }
        page.cleanup();
        void doc.destroy();
        setLoading(false);
      } catch (err) {
        if (genRef.current !== gen) return;
        const name = (err as { name?: string } | null)?.name;
        setLoading(false);
        setLoadError(
          name === "PasswordException"
            ? "This PDF is password protected. Unlock it first."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const save = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || saving) return;
    setSaving(true);
    setSaveError(null);
    const gen = genRef.current;
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.load(buffer.slice(0), {
        ignoreEncryption: true,
      });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;

      pages.forEach((page, i) => {
        const text = label(startAt + i, startAt + total - 1, format);
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);

        const x = position.endsWith("center")
          ? (width - textWidth) / 2
          : position.endsWith("right")
            ? width - MARGIN - textWidth
            : MARGIN;
        const y = position.startsWith("bottom")
          ? MARGIN
          : height - MARGIN - fontSize;

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      });

      const bytes = await doc.save();
      if (genRef.current !== gen) return;
      const baseName = (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${baseName}-numbered.pdf`,
      );
    } catch {
      setSaveError("Could not add page numbers. The PDF may be encrypted or corrupted.");
    } finally {
      setSaving(false);
    }
  }, [saving, startAt, format, fontSize, position, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Numbers are stamped on every page."
        />
      </Panel>
    );
  }

  const previewText = label(startAt, startAt + Math.max(pageCount - 1, 0), format);

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {loading ? "Reading file" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
            {" · "}
            {formatBytes(fileSize)}
          </p>
        </div>
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

      {!loadError && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Preview */}
          <Panel title="Preview (page 1)" bodyClassName="flex items-center justify-center bg-muted/30 p-4">
            {preview ? (
              <div className="relative inline-block max-w-full">
                <img
                  src={preview}
                  alt="First page preview"
                  className="max-h-[460px] w-auto max-w-full rounded border border-border shadow-sm"
                />
                <div
                  className={`pointer-events-none absolute inset-0 flex p-[6%] ${ALIGN[position]}`}
                >
                  <span className="rounded bg-white/85 px-1.5 py-0.5 text-[11px] font-medium text-neutral-900 shadow-sm">
                    {previewText}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Rendering preview…
              </div>
            )}
          </Panel>

          {/* Options */}
          <div className="flex flex-col gap-4">
            <Panel title="Options" bodyClassName="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="pn-position">Position</Label>
                <Select
                  id="pn-position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value as Position)}
                >
                  <option value="bottom-center">Bottom center</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="top-center">Top center</option>
                  <option value="top-right">Top right</option>
                  <option value="top-left">Top left</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pn-format">Format</Label>
                <Select
                  id="pn-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                >
                  <option value="n">1, 2, 3…</option>
                  <option value="n-of-total">1 / N</option>
                  <option value="page-n">Page 1</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pn-start">Start at</Label>
                  <Input
                    id="pn-start"
                    type="number"
                    min={0}
                    value={startAt}
                    onChange={(e) => setStartAt(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pn-size">Font size</Label>
                  <Input
                    id="pn-size"
                    type="number"
                    min={6}
                    max={48}
                    value={fontSize}
                    onChange={(e) =>
                      setFontSize(Math.min(48, Math.max(6, Number(e.target.value))))
                    }
                  />
                </div>
              </div>
            </Panel>

            <Button onClick={() => void save()} disabled={saving || loading}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Download numbered PDF
            </Button>
            {saveError && (
              <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {saveError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="add-pdf-page-numbers">
      <AddPageNumbersClient />
    </ToolPage>
  );
}
