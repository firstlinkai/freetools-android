import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { Table2, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatBytes } from "@/lib/download";
import { xlsxToRows } from "@/lib/office";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 10;
const LINE_HEIGHT = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const MAX_COLUMNS = 8;
const CELL_PADDING = 4;

/** Truncate cell text with an ellipsis so it fits within `width`. */
function clipCell(text: string, font: PDFFont, size: number, width: number): string {
  const max = width - CELL_PADDING;
  if (max <= 0) return "";
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  const ellipsis = "…";
  let out = "";
  for (const ch of text) {
    if (font.widthOfTextAtSize(out + ch + ellipsis, size) > max) break;
    out += ch;
  }
  return out ? out + ellipsis : ellipsis;
}

async function buildPdf(rows: string[][]): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const columnCount = Math.min(
    MAX_COLUMNS,
    Math.max(1, rows.reduce((m, r) => Math.max(m, r.length), 0)),
  );
  const columnWidth = CONTENT_WIDTH / columnCount;

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const row of rows) {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    for (let col = 0; col < columnCount; col++) {
      const cell = row[col] ?? "";
      if (cell === "") continue;
      page.drawText(clipCell(cell, font, FONT_SIZE, columnWidth), {
        x: MARGIN + col * columnWidth,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
    y -= LINE_HEIGHT;
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function ExcelToPdfClient() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const reset = () => {
    setFile(null);
    setRows(null);
    setError(null);
    setConverting(false);
  };

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setRows(null);
    setFile(f);
    try {
      const parsed = await xlsxToRows(f);
      setRows(parsed);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Could not read this .xlsx file.");
    }
  };

  const convert = async () => {
    if (!file || !rows) return;
    setConverting(true);
    setError(null);
    try {
      const blob = await buildPdf(rows);
      const base = file.name.replace(/\.xlsx$/i, "");
      downloadBlob(blob, `${base}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  const previewCols = rows
    ? Math.min(MAX_COLUMNS, Math.max(1, rows.reduce((m, r) => Math.max(m, r.length), 0)))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      {!file ? (
        <>
          <FileDropzone
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onFiles={onFiles}
            hint="Excel spreadsheet (.xlsx)"
          />
          <p className="text-xs text-muted-foreground">
            This tool converts the <strong>text values</strong> of the first worksheet into a simple
            tabular PDF. Formulas, styling, charts, and exact layout are not reproduced.
          </p>
        </>
      ) : (
        <Panel
          title="Excel spreadsheet"
          actions={
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <Table2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {rows ? ` · ${rows.length} row${rows.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <Button onClick={convert} disabled={!rows || converting}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {converting ? "Converting…" : "Convert to PDF"}
              </Button>
            </div>

            {rows && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Preview (first {Math.min(15, rows.length)} rows)
                </p>
                <div className="max-h-80 overflow-auto rounded-md border border-border bg-card">
                  {rows.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No data found in this sheet.</p>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <tbody>
                        {rows.slice(0, 15).map((row, r) => (
                          <tr key={r} className="border-b border-border last:border-0">
                            {Array.from({ length: previewCols }).map((_, c) => (
                              <td
                                key={c}
                                className="max-w-[16rem] truncate border-r border-border px-2 py-1 text-foreground last:border-0"
                              >
                                {row[c] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Text values only — up to {MAX_COLUMNS} columns are rendered; wider tables are
              truncated. Formulas, styling, charts, and exact layout are not reproduced.
            </p>
          </div>
        </Panel>
      )}

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="excel-to-pdf">
      <ExcelToPdfClient />
    </ToolPage>
  );
}
