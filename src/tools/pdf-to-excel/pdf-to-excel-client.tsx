import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Loader2, RotateCcw, Table2 } from "lucide-react";
import Papa from "papaparse";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface Result {
  rows: string[][];
  pages: number;
}

// Text fragments on the same visual line rarely share an exact baseline, so we
// cluster rows whose y-coordinate falls within this many PDF points.
const ROW_TOLERANCE = 3;
const PREVIEW_ROWS = 15;

export function PdfToExcelClient() {
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

  const extract = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setError("That file isn't a PDF.");
      return;
    }
    setError(null);
    setResult(null);
    setFileName(file.name);
    setFileSize(file.size);
    setBusy(true);
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

      setProgress({ done: 0, total: doc.numPages });
      const allRows: string[][] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        const page = await doc.getPage(i);
        const content = await page.getTextContent();

        // Collect positioned text fragments (skip marked-content markers).
        const frags: { x: number; y: number; str: string }[] = [];
        for (const item of content.items) {
          if (!("str" in item)) continue;
          frags.push({
            x: item.transform[4],
            y: item.transform[5],
            str: item.str,
          });
        }
        page.cleanup();

        // Sort top→bottom (PDF y grows upward), then left→right, so same-line
        // fragments land next to one another.
        frags.sort((a, b) => b.y - a.y || a.x - b.x);

        const lines: { y: number; cells: { x: number; str: string }[] }[] = [];
        for (const f of frags) {
          const last = lines[lines.length - 1];
          if (last && Math.abs(last.y - f.y) <= ROW_TOLERANCE) {
            last.cells.push({ x: f.x, str: f.str });
          } else {
            lines.push({ y: f.y, cells: [{ x: f.x, str: f.str }] });
          }
        }

        for (const line of lines) {
          const cells = line.cells
            .sort((a, b) => a.x - b.x)
            .map((c) => c.str.trim());
          if (cells.some((c) => c.length > 0)) allRows.push(cells);
        }

        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        setProgress({ done: i, total: doc.numPages });
      }

      const pages = doc.numPages;
      void doc.destroy();
      if (genRef.current !== gen) return;

      if (allRows.length === 0) {
        setError(
          "No selectable text was found. This PDF may be a scanned image — table extraction needs a text-based PDF.",
        );
        return;
      }
      setResult({ rows: allRows, pages });
    } catch (err) {
      if (genRef.current !== gen) return;
      const name = (err as { name?: string } | null)?.name;
      setError(
        name === "PasswordException"
          ? "This PDF is password protected. Unlock it first, then extract the table."
          : "Could not read this file. It may be corrupted or not a valid PDF.",
      );
    } finally {
      if (genRef.current === gen) {
        setBusy(false);
        setProgress(null);
      }
    }
  }, []);

  const download = useCallback(() => {
    if (!result || !fileName) return;
    const csv = Papa.unparse(result.rows);
    const base = fileName.replace(/\.pdf$/i, "") || "table";
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `${base}.csv`,
    );
  }, [result, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void extract(files[0])}
          hint="PDF only. Works best on simple, text-based tables."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const previewRows = result?.rows.slice(0, PREVIEW_ROWS) ?? [];
  const maxCols = previewRows.reduce((m, r) => Math.max(m, r.length), 0);

  return (
    <div className="space-y-4">
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            {busy
              ? "Extracting text"
              : result
                ? `${result.pages} page${result.pages === 1 ? "" : "s"} · ${result.rows.length} row${result.rows.length === 1 ? "" : "s"} detected`
                : formatBytes(fileSize)}
          </p>
        </div>
        {busy && progress && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Page {progress.done}/{progress.total}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {busy && !progress && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Reading PDF…
        </div>
      )}

      {result && (
        <>
          <Panel
            title="Detected table"
            actions={
              <span className="text-xs text-muted-foreground">
                {result.rows.length > PREVIEW_ROWS
                  ? `First ${PREVIEW_ROWS} of ${result.rows.length} rows`
                  : `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`}
              </span>
            }
            bodyClassName="p-0"
          >
            <div className="max-h-[26rem] overflow-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className="even:bg-muted/30">
                      {Array.from({ length: maxCols }).map((_, ci) => (
                        <td
                          key={ci}
                          className="max-w-[16rem] truncate border border-border px-2 py-1 align-top text-foreground"
                          title={row[ci] ?? ""}
                        >
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={download}>
              <Download className="h-4 w-4" aria-hidden />
              Download CSV
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Table2 className="h-3.5 w-3.5" aria-hidden />
              Opens directly in Excel, Numbers, or Google Sheets
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Exported as CSV. Column and table detection is heuristic — it reads
              each line of text and splits it into cells by position, so it works
              best on simple, evenly-spaced tabular PDFs. Complex layouts, merged
              cells, or multi-column pages may need cleanup in your spreadsheet.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="pdf-to-excel">
      <PdfToExcelClient />
    </ToolPage>
  );
}
