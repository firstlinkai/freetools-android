import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { Presentation, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatBytes } from "@/lib/download";
import { pptxToSlides } from "@/lib/office";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const HEADER_SIZE = 16;
const LINE_HEIGHT = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

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

async function buildPdf(slides: string[][]): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const headerFont = await doc.embedFont(StandardFonts.HelveticaBold);

  slides.forEach((lines, index) => {
    let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const ensureRoom = () => {
      if (y < MARGIN) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
    };

    // Slide header.
    page.drawText(`Slide ${index + 1}`, {
      x: MARGIN,
      y,
      size: HEADER_SIZE,
      font: headerFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= HEADER_SIZE + 8;

    for (const raw of lines) {
      for (const line of wrapText(raw, font, FONT_SIZE)) {
        ensureRoom();
        page.drawText(line, {
          x: MARGIN,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= LINE_HEIGHT;
      }
    }
  });

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function PptToPdfClient() {
  const [file, setFile] = useState<File | null>(null);
  const [slides, setSlides] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const reset = () => {
    setFile(null);
    setSlides(null);
    setError(null);
    setConverting(false);
  };

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setSlides(null);
    setFile(f);
    try {
      const parsed = await pptxToSlides(f);
      setSlides(parsed);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Could not read this .pptx file.");
    }
  };

  const convert = async () => {
    if (!file || !slides) return;
    setConverting(true);
    setError(null);
    try {
      const blob = await buildPdf(slides);
      const base = file.name.replace(/\.pptx$/i, "");
      downloadBlob(blob, `${base}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  const firstSlide = slides?.[0] ?? [];

  return (
    <div className="flex flex-col gap-4">
      {!file ? (
        <>
          <FileDropzone
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onFiles={onFiles}
            hint="PowerPoint presentation (.pptx)"
          />
          <p className="text-xs text-muted-foreground">
            This tool converts the <strong>text content</strong> of each slide into a clean PDF, one
            page per slide. Themes, images, and exact layout are not reproduced.
          </p>
        </>
      ) : (
        <Panel
          title="PowerPoint presentation"
          actions={
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <Presentation className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {slides ? ` · ${slides.length} slide${slides.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <Button onClick={convert} disabled={!slides || converting}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {converting ? "Converting…" : "Convert to PDF"}
              </Button>
            </div>

            {slides && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Preview (Slide 1 of {slides.length})
                </p>
                <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-card p-3">
                  {firstSlide.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No text on the first slide.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {firstSlide.map((line, i) => (
                        <p key={i} className="text-sm text-foreground">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Text content only — themes, colors, images, and exact layout from the original are not
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
    <ToolPage slug="ppt-to-pdf">
      <PptToPdfClient />
    </ToolPage>
  );
}
