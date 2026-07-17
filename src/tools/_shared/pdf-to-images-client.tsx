"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface PageImage {
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

export function PdfToImagesClient({
  format,
  ext,
}: {
  format: "image/jpeg" | "image/png";
  ext: "jpg" | "png";
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bufferRef = useRef<ArrayBuffer | null>(null);
  const urlsRef = useRef<string[]>([]);
  const genRef = useRef(0);

  const clearPages = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setPages([]);
  }, []);

  useEffect(
    () => () => {
      genRef.current++;
      clearPages();
    },
    [clearPages],
  );

  const render = useCallback(
    async (buffer: ArrayBuffer) => {
      setRendering(true);
      setError(null);
      clearPages();
      const gen = ++genRef.current;
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({
          data: new Uint8Array(buffer.slice(0)),
        }).promise;
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        setProgress({ done: 0, total: doc.numPages });
        const out: PageImage[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (genRef.current !== gen) {
            void doc.destroy();
            return;
          }
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          if (format === "image/jpeg") {
            ctx.fillStyle = "#ffffff"; // JPEG has no alpha
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, format, 0.9),
          );
          page.cleanup();
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          urlsRef.current.push(url);
          out.push({ url, blob, width: canvas.width, height: canvas.height });
          if (genRef.current !== gen) return;
          setProgress({ done: i, total: doc.numPages });
          setPages(out.slice());
        }
        void doc.destroy();
      } catch (err) {
        if (genRef.current !== gen) return;
        const name = (err as { name?: string } | null)?.name;
        setError(
          name === "PasswordException"
            ? "This PDF is password protected. Unlock it first."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      } finally {
        setRendering(false);
        setProgress(null);
      }
    },
    [scale, format, clearPages],
  );

  const loadFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      bufferRef.current = buffer;
      void render(buffer);
    },
    [render],
  );

  const reset = useCallback(() => {
    genRef.current++;
    bufferRef.current = null;
    clearPages();
    setFileName(null);
    setError(null);
  }, [clearPages]);

  const downloadOne = useCallback(
    (i: number) => {
      const base = (fileName ?? "page").replace(/\.pdf$/i, "") || "page";
      downloadBlob(pages[i].blob, `${base}-p${i + 1}.${ext}`);
    },
    [pages, fileName, ext],
  );

  const downloadAll = useCallback(async () => {
    const base = (fileName ?? "page").replace(/\.pdf$/i, "") || "page";
    for (let i = 0; i < pages.length; i++) {
      downloadBlob(pages[i].blob, `${base}-p${i + 1}.${ext}`);
      // Space downloads out so the browser doesn't drop them.
      if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
  }, [pages, fileName, ext]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint={`PDF only. Every page is rendered to a ${ext.toUpperCase()} you can download.`}
        />
      </Panel>
    );
  }

  const totalSize = pages.reduce((s, p) => s + p.blob.size, 0);

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {rendering && progress
              ? `Rendering ${progress.done}/${progress.total}`
              : `${pages.length} page${pages.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="scale" className="whitespace-nowrap">
            Resolution
          </Label>
          <Select
            id="scale"
            value={scale}
            disabled={rendering}
            onChange={(e) => {
              const s = Number(e.target.value);
              setScale(s);
              if (bufferRef.current) void render(bufferRef.current);
            }}
            className="w-24"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          New PDF
        </Button>
      </Panel>

      {error && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {pages.length > 0 && (
        <>
          <Button onClick={() => void downloadAll()} disabled={rendering}>
            <Download className="h-4 w-4" aria-hidden />
            Download all {pages.length} {ext.toUpperCase()}
            {pages.length === 1 ? "" : "s"}
          </Button>

          <Panel title="Pages" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {pages.map((page, i) => (
                <div
                  key={i}
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                >
                  <span className="flex items-center justify-center bg-muted p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={page.url}
                      alt={`Page ${i + 1}`}
                      className="h-auto max-w-full rounded-sm border border-border shadow-sm"
                    />
                  </span>
                  <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
                    <span className="text-xs text-muted-foreground">
                      {i + 1} · {formatBytes(page.blob.size)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Download page ${i + 1}`}
                      onClick={() => downloadOne(i)}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      {rendering && pages.length === 0 && (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Rendering pages…
        </div>
      )}
    </div>
  );
}
