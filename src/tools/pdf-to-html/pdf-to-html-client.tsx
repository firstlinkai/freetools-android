import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileCode2, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface TextItemLike {
  str?: string;
  transform?: number[];
}

interface PageLines {
  page: number;
  lines: string[];
}

interface Result {
  pages: PageLines[];
  html: string;
  pageCount: number;
}

const PREVIEW_LINES = 40;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Group text items into visual lines, top→bottom, left→right. */
function reconstructLines(items: TextItemLike[]): string[] {
  const buckets = new Map<number, { x: number; str: string }[]>();
  for (const item of items) {
    const str = item.str ?? "";
    const transform = item.transform;
    if (!transform || transform.length < 6) continue;
    const y = Math.round(transform[5]);
    const x = transform[4];
    // Snap to a nearby existing bucket (within ~2px) to merge line fragments.
    let key = y;
    for (const existing of buckets.keys()) {
      if (Math.abs(existing - y) <= 2) {
        key = existing;
        break;
      }
    }
    const arr = buckets.get(key) ?? [];
    arr.push({ x, str });
    buckets.set(key, arr);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0]) // top of page first (larger y)
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

function buildHtml(base: string, pages: PageLines[]): string {
  const sections = pages
    .map((p) => {
      const paras = p.lines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("\n");
      return `<section class="page">\n<h2>Page ${p.page}</h2>\n${paras}\n</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(base)}</title>
<style>
body{max-width:800px;margin:40px auto;font-family:system-ui;line-height:1.6;padding:0 16px}
.page{margin-bottom:32px}
h2{color:#555;font-size:14px}
</style>
</head>
<body>
${sections}
</body>
</html>`;
}

export function PdfToHtmlClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(false);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setError("That file isn't a PDF.");
      return;
    }
    setError(null);
    setResult(null);
    setFileName(file.name);
    setFileSize(file.size);
    bufferRef.current = await file.arrayBuffer();
  }, []);

  const convert = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
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

      const pages: PageLines[] = [];
      setProgress({ done: 0, total: doc.numPages });

      for (let i = 1; i <= doc.numPages; i++) {
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const lines = reconstructLines(tc.items as TextItemLike[]);
        page.cleanup();
        pages.push({ page: i, lines });
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        setProgress({ done: i, total: doc.numPages });
      }

      const pageCount = doc.numPages;
      void doc.destroy();

      const base = (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      const html = buildHtml(base, pages);
      if (genRef.current !== gen) return;
      setResult({ pages, html, pageCount });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      setError(
        name === "PasswordException"
          ? "This PDF is password protected. Unlock it first, then convert."
          : "Could not read this file. It may be corrupted or not a valid PDF.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [busy, fileName]);

  const download = useCallback(() => {
    if (!result || !fileName) return;
    const base = fileName.replace(/\.pdf$/i, "") || "document";
    downloadBlob(new Blob([result.html], { type: "text/html" }), `${base}.html`);
  }, [result, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Converts the text flow into a clean HTML page."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const previewLines = result
    ? result.pages.flatMap((p) => [`# Page ${p.page}`, ...p.lines]).slice(0, PREVIEW_LINES)
    : [];
  const totalLines = result
    ? result.pages.reduce((n, p) => n + p.lines.length, 0)
    : 0;

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {result
              ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · `
              : ""}
            {formatBytes(fileSize)}
          </p>
        </div>
        {progress && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Reading {progress.done}/{progress.total}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {!result && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void convert()} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {progress ? `Converting ${progress.done}/${progress.total}` : "Converting"}
              </>
            ) : (
              <>
                <FileCode2 className="h-4 w-4" aria-hidden />
                Convert to HTML
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Converts the text flow, not the exact visual layout.
          </span>
        </div>
      )}

      {result && (
        <Panel
          title="Preview"
          actions={
            <Button size="sm" onClick={download}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download HTML
            </Button>
          }
          bodyClassName="space-y-3 p-4"
        >
          <p className="text-xs text-muted-foreground">
            {result.pageCount} page{result.pageCount === 1 ? "" : "s"} · {totalLines}{" "}
            line{totalLines === 1 ? "" : "s"} extracted
            {totalLines > PREVIEW_LINES ? ` · showing first ${PREVIEW_LINES}` : ""}
          </p>
          {totalLines === 0 ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              No selectable text was found. This PDF may be a scan or use images
              for its text — try an OCR tool first.
            </p>
          ) : (
            <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {previewLines.join("\n")}
            </pre>
          )}
          <p className="text-xs text-muted-foreground">
            Converts the text flow, not the exact visual layout. Fonts, images,
            columns, and positioning are simplified into a linear document.
          </p>
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
    <ToolPage slug="pdf-to-html">
      <PdfToHtmlClient />
    </ToolPage>
  );
}
