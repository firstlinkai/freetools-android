import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface Result {
  blob: Blob;
  pages: number;
}

export function CompressPdfClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [quality, setQuality] = useState(65);
  const [scale, setScale] = useState(1.5);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bufferRef = useRef<ArrayBuffer | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const genRef = useRef(0);

  useEffect(
    () => () => {
      genRef.current++;
      bufferRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const loadFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setError("That file isn't a PDF.");
      return;
    }
    setError(null);
    setResult(null);
    setFileName(file.name);
    setOriginalSize(file.size);
    bufferRef.current = await file.arrayBuffer();
  }, []);

  const compress = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    const gen = ++genRef.current;

    try {
      const pdfjs = await loadPdfjs();
      const { PDFDocument } = await import("pdf-lib");
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer.slice(0)),
      }).promise;
      if (genRef.current !== gen) {
        void doc.destroy();
        return;
      }

      const out = await PDFDocument.create();
      setProgress({ done: 0, total: doc.numPages });

      for (let i = 1; i <= doc.numPages; i++) {
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        const page = await doc.getPage(i);
        const pointVp = page.getViewport({ scale: 1 }); // 1 unit = 1 pt
        const renderVp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(renderVp.width);
        canvas.height = Math.ceil(renderVp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff"; // flatten transparency for JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
        const jpegDataUrl = canvas.toDataURL("image/jpeg", quality / 100);
        page.cleanup();

        const embedded = await out.embedJpg(jpegDataUrl);
        const p = out.addPage([pointVp.width, pointVp.height]);
        p.drawImage(embedded, {
          x: 0,
          y: 0,
          width: pointVp.width,
          height: pointVp.height,
        });
        if (genRef.current !== gen) return;
        setProgress({ done: i, total: doc.numPages });
      }

      void doc.destroy();
      const bytes = await out.save();
      if (genRef.current !== gen) return;
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      resultUrlRef.current = URL.createObjectURL(blob);
      setResult({ blob, pages: doc.numPages });
    } catch {
      setError("Could not compress this PDF. It may be encrypted or corrupted.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [busy, quality, scale]);

  const download = useCallback(() => {
    if (!result || !fileName) return;
    const base = fileName.replace(/\.pdf$/i, "") || "document";
    downloadBlob(result.blob, `${base}-compressed.pdf`);
  }, [result, fileName]);

  const reset = useCallback(() => {
    genRef.current++;
    bufferRef.current = null;
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setFileName(null);
    setOriginalSize(0);
    setResult(null);
    setError(null);
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Best for scanned or image-heavy documents."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const saved =
    result && originalSize > 0
      ? Math.round(((originalSize - result.blob.size) / originalSize) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(originalSize)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          New PDF
        </Button>
      </Panel>

      <Panel title="Compression settings" bodyClassName="space-y-4 p-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="q">Image quality</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{quality}%</span>
          </div>
          <Slider
            id="q"
            min={10}
            max={95}
            step={1}
            value={quality}
            disabled={busy}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </div>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="res">Resolution</Label>
          <Select
            id="res"
            value={scale}
            disabled={busy}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value={1}>Standard (72 dpi)</option>
            <option value={1.5}>Good (108 dpi)</option>
            <option value={2}>High (144 dpi)</option>
          </Select>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            This flattens each page into a compressed image, so selectable text
            and links are removed. Ideal for scans and image-heavy PDFs; not for
            documents where you need to keep the text layer.
          </span>
        </div>
        <Button onClick={() => void compress()} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {progress ? `Compressing ${progress.done}/${progress.total}` : "Compressing"}
            </>
          ) : (
            "Compress PDF"
          )}
        </Button>
      </Panel>

      {result && (
        <Panel title="Result" bodyClassName="space-y-3 p-4">
          <p className="text-sm">
            <span className="font-medium">{formatBytes(originalSize)}</span> →{" "}
            <span className="font-medium">{formatBytes(result.blob.size)}</span>{" "}
            <span className={saved >= 0 ? "font-semibold text-accent" : "font-semibold text-danger"}>
              ({saved >= 0 ? `${saved}% smaller` : `${-saved}% larger`})
            </span>
          </p>
          {saved < 0 && (
            <p className="text-xs text-muted-foreground">
              This PDF was already efficiently compressed — try a lower quality or
              resolution, or keep the original.
            </p>
          )}
          <Button onClick={download}>
            <Download className="h-4 w-4" aria-hidden />
            Download compressed PDF
          </Button>
        </Panel>
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
    <ToolPage slug="compress-pdf">
      <CompressPdfClient />
    </ToolPage>
  );
}
