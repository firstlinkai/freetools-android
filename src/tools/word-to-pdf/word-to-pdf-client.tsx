import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FileText, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatBytes } from "@/lib/download";
import { docxToParagraphs } from "@/lib/office";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Break a single word that is wider than the content width into hard chunks. */
function hardBreak(word: string, font: PDFFont, size: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const ch of word) {
    const next = current + ch;
    if (current && font.widthOfTextAtSize(next, size) > CONTENT_WIDTH) {
      chunks.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Wrap a paragraph of text into lines that fit within CONTENT_WIDTH. */
function wrapText(text: string, font: PDFFont, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const rawWord of text.split(/\s+/)) {
    if (!rawWord) continue;
    const words =
      font.widthOfTextAtSize(rawWord, size) > CONTENT_WIDTH
        ? hardBreak(rawWord, font, size)
        : [rawWord];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > CONTENT_WIDTH) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function buildPdf(paragraphs: string[]): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawLine = (text: string) => {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(text, {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= LINE_HEIGHT;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      y -= LINE_HEIGHT;
      continue;
    }
    for (const line of wrapText(paragraph, font, FONT_SIZE)) drawLine(line);
    // Blank line between paragraphs.
    y -= LINE_HEIGHT;
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function WordToPdfClient() {
  const [file, setFile] = useState<File | null>(null);
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const reset = () => {
    setFile(null);
    setParagraphs(null);
    setError(null);
    setConverting(false);
  };

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setParagraphs(null);
    setFile(f);
    try {
      const paras = await docxToParagraphs(f);
      setParagraphs(paras);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Could not read this .docx file.");
    }
  };

  const convert = async () => {
    if (!file || !paragraphs) return;
    setConverting(true);
    setError(null);
    try {
      const blob = await buildPdf(paragraphs);
      const base = file.name.replace(/\.docx$/i, "");
      downloadBlob(blob, `${base}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  const nonEmpty = paragraphs?.filter((p) => p.trim() !== "") ?? [];

  return (
    <div className="flex flex-col gap-4">
      {!file ? (
        <>
          <FileDropzone
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onFiles={onFiles}
            hint="Word document (.docx)"
          />
          <p className="text-xs text-muted-foreground">
            This tool converts the <strong>text content</strong> of your document into a clean PDF.
            Original fonts, colors, images, and exact layout are not reproduced.
          </p>
        </>
      ) : (
        <Panel
          title="Word document"
          actions={
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {paragraphs ? ` · ${nonEmpty.length} paragraph${nonEmpty.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <Button onClick={convert} disabled={!paragraphs || converting}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {converting ? "Converting…" : "Convert to PDF"}
              </Button>
            </div>

            {paragraphs && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Preview (first {Math.min(30, nonEmpty.length)} paragraphs)
                </p>
                <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-card p-3">
                  {nonEmpty.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No text found in this document.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {nonEmpty.slice(0, 30).map((p, i) => (
                        <p key={i} className="text-sm text-foreground">
                          {p}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Text content only — fonts, colors, images, and exact layout from the original are not
              reproduced.
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
    <ToolPage slug="word-to-pdf">
      <WordToPdfClient />
    </ToolPage>
  );
}
