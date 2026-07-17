import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, RotateCcw, Stamp } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

type Placement = "tiled" | "centered";
type ColorKey = "gold" | "gray" | "red" | "black" | "white";

const COLORS: Record<ColorKey, { label: string; css: string; rgb: [number, number, number] }> = {
  gold: { label: "Gold", css: "#FFD700", rgb: [1, 0.843, 0] },
  gray: { label: "Gray", css: "#8c8c8c", rgb: [0.55, 0.55, 0.55] },
  red: { label: "Red", css: "#dc2626", rgb: [0.86, 0.15, 0.15] },
  black: { label: "Black", css: "#000000", rgb: [0, 0, 0] },
  white: { label: "White", css: "#ffffff", rgb: [1, 1, 1] },
};

/** Characters pdf-lib's standard (WinAnsi-encoded) fonts can draw. */
const WINANSI_SAFE = /^[\x20-\x7E -ÿ–—‘’“”•…€]*$/;

/**
 * Tile anchor points in PDF points (origin bottom-left). Shared by the
 * approximate on-screen preview and the actual export so they agree.
 */
function tilePositions(
  pageW: number,
  pageH: number,
  textW: number,
  fontSize: number,
): { x: number; y: number }[] {
  const stepX = Math.max(textW + 80, 120);
  const stepY = Math.max(fontSize + 110, 120);
  const pts: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = stepY / 2; y < pageH + stepY && pts.length < 400; y += stepY, row++) {
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = -stepX / 2 + offset; x < pageW + stepX && pts.length < 400; x += stepX) {
      pts.push({ x, y });
    }
  }
  return pts;
}

interface FirstPage {
  dataUrl: string;
  widthPt: number;
  heightPt: number;
}

/** Preview render width in CSS px (w-72). */
const PREVIEW_W = 288;

export function WatermarkPdfClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstPage, setFirstPage] = useState<FirstPage | null>(null);

  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(45);
  const [colorKey, setColorKey] = useState<ColorKey>("gold");
  const [placement, setPlacement] = useState<Placement>("tiled");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Original file bytes, read once. pdfjs and pdf-lib each get their own copy
  // because pdfjs transfers (detaches) the buffer it receives.
  const bufferRef = useRef<ArrayBuffer | null>(null);
  // Bumped on reset / new file so in-flight async work stops cleanly.
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
    setFirstPage(null);
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

        // Render only page 1 — it backs the live preview.
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (PREVIEW_W * 2) / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        page.cleanup();
        void doc.destroy();
        if (genRef.current !== gen) return;

        setFirstPage({ dataUrl, widthPt: base.width, heightPt: base.height });
        setLoading(false);
      } catch (err) {
        if (genRef.current !== gen) return;
        const name = (err as { name?: string } | null)?.name;
        setLoading(false);
        setLoadError(
          name === "PasswordException"
            ? "This PDF is password protected. Unlock it first, then watermark."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const textOk = WINANSI_SAFE.test(text);

  const save = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || saving || text.trim().length === 0 || !textOk) return;
    setSaving(true);
    setSaveError(null);
    const gen = genRef.current;

    try {
      const { PDFDocument, StandardFonts, degrees, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.load(buffer.slice(0), {
        ignoreEncryption: true,
      });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const [r, g, b] = COLORS[colorKey].rgb;
      const color = rgb(r, g, b);

      const textW = font.widthOfTextAtSize(text, fontSize);
      const textH = font.heightAtSize(fontSize);
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        const common = {
          font,
          size: fontSize,
          color,
          opacity,
          rotate: degrees(rotation),
        };
        if (placement === "centered") {
          // Offset the baseline origin so the text's center lands on the
          // page center after rotation about the origin.
          const x = width / 2 - (textW / 2) * cos + (textH / 2) * sin;
          const y = height / 2 - (textW / 2) * sin - (textH / 2) * cos;
          page.drawText(text, { ...common, x, y });
        } else {
          for (const pos of tilePositions(width, height, textW, fontSize)) {
            page.drawText(text, { ...common, x: pos.x, y: pos.y });
          }
        }
      }

      const bytes = await doc.save();
      if (genRef.current !== gen) return;
      const baseName =
        (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${baseName}-watermarked.pdf`,
      );
    } catch {
      setSaveError(
        "Could not watermark this PDF. It may be encrypted or corrupted.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, text, textOk, fontSize, opacity, rotation, colorKey, placement, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Stamps your text across every page."
        />
      </Panel>
    );
  }

  // ── Approximate preview geometry ─────────────────────────────────────
  const previewScale = firstPage ? PREVIEW_W / firstPage.widthPt : 1;
  // Rough Helvetica-Bold width estimate; the export measures exactly.
  const approxTextW = fontSize * 0.6 * Math.max(text.length, 1);
  const previewTiles =
    firstPage && placement === "tiled"
      ? tilePositions(firstPage.widthPt, firstPage.heightPt, approxTextW, fontSize)
      : [];

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
        {loading && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Loading
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
          {/* Controls */}
          <Panel title="Watermark" bodyClassName="flex flex-col gap-4 p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wm-text">Text</Label>
              <Input
                id="wm-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. CONFIDENTIAL"
                maxLength={80}
              />
              {!textOk && (
                <p className="text-xs text-danger">
                  Only Latin letters, digits and common punctuation are
                  supported by the built-in PDF fonts.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wm-size">
                Font size <span className="text-muted-foreground">· {fontSize} pt</span>
              </Label>
              <Slider
                id="wm-size"
                min={12}
                max={120}
                step={2}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wm-opacity">
                Opacity{" "}
                <span className="text-muted-foreground">
                  · {Math.round(opacity * 100)}%
                </span>
              </Label>
              <Slider
                id="wm-opacity"
                min={5}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wm-rotation">
                Rotation <span className="text-muted-foreground">· {rotation}°</span>
              </Label>
              <Slider
                id="wm-rotation"
                min={-90}
                max={90}
                step={5}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wm-color">Color</Label>
                <Select
                  id="wm-color"
                  value={colorKey}
                  onChange={(e) => setColorKey(e.target.value as ColorKey)}
                >
                  {(Object.keys(COLORS) as ColorKey[]).map((key) => (
                    <option key={key} value={key}>
                      {COLORS[key].label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wm-placement">Placement</Label>
                <Select
                  id="wm-placement"
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as Placement)}
                >
                  <option value="tiled">Tiled across the page</option>
                  <option value="centered">Centered</option>
                </Select>
              </div>
            </div>
          </Panel>

          {/* Approximate preview */}
          {firstPage && (
            <Panel title="Preview (page 1, approximate)" bodyClassName="p-3">
              <div
                className="relative mx-auto overflow-hidden rounded-md border border-border bg-white"
                style={{
                  width: PREVIEW_W,
                  maxWidth: "100%",
                  aspectRatio: `${firstPage.widthPt / firstPage.heightPt}`,
                }}
              >
                <img
                  src={firstPage.dataUrl}
                  alt="First page of the PDF"
                  className="absolute inset-0 h-full w-full"
                  draggable={false}
                />
                {text.trim().length > 0 &&
                  (placement === "centered" ? (
                    <span
                      className="pointer-events-none absolute left-1/2 top-1/2 whitespace-nowrap font-bold"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                        fontSize: fontSize * previewScale,
                        color: COLORS[colorKey].css,
                        opacity,
                      }}
                    >
                      {text}
                    </span>
                  ) : (
                    previewTiles.map((pos, i) => (
                      <span
                        key={i}
                        className="pointer-events-none absolute whitespace-nowrap font-bold"
                        style={{
                          left: pos.x * previewScale,
                          bottom: pos.y * previewScale,
                          transformOrigin: "left bottom",
                          transform: `rotate(${-rotation}deg)`,
                          fontSize: fontSize * previewScale,
                          color: COLORS[colorKey].css,
                          opacity,
                          lineHeight: 1,
                        }}
                      >
                        {text}
                      </span>
                    ))
                  ))}
              </div>
            </Panel>
          )}

          {/* Export */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void save()}
              disabled={saving || text.trim().length === 0 || !textOk}
              className="h-12 px-5"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Stamp className="h-4 w-4" aria-hidden />
              )}
              Watermark {pageCount} page{pageCount === 1 ? "" : "s"} &amp; export
            </Button>
            {text.trim().length === 0 && (
              <span className="text-xs text-muted-foreground">
                Enter watermark text to enable the export.
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
    <ToolPage slug="watermark-pdf">
      <WatermarkPdfClient />
    </ToolPage>
  );
}
