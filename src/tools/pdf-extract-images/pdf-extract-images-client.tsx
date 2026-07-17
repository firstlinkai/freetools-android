import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileArchive,
  FileText,
  Images,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

interface ExtractedImage {
  id: string;
  url: string; // object URL for the grid thumbnail
  blob: Blob; // PNG bytes for saving
  width: number;
  height: number;
  page: number; // 1-based page the image first appeared on
}

/** Stop collecting after this many images to keep memory bounded. */
const MAX_IMAGES = 200;

/**
 * A decoded pdf.js image object. Depending on the pdf.js build/branch the
 * pixels arrive either as an ImageBitmap (`bitmap`) or raw bytes (`data` +
 * `kind`: 1 = 1bpp grayscale, 2 = RGB24, 3 = RGBA32).
 */
interface PdfjsImageLike {
  width?: number;
  height?: number;
  bitmap?: ImageBitmap;
  data?: Uint8Array | Uint8ClampedArray;
  kind?: number;
}

/** Draw a pdf.js image object onto a canvas; null when it can't be decoded. */
function imageToCanvas(img: PdfjsImageLike): HTMLCanvasElement | null {
  const width = img.width ?? 0;
  const height = img.height ?? 0;
  if (width < 1 || height < 1) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0, width, height);
    return canvas;
  }

  const data = img.data;
  if (!data) return null;
  const out = ctx.createImageData(width, height);
  const px = out.data;

  if (img.kind === 3) {
    // RGBA_32BPP — bytes map 1:1.
    if (data.length < width * height * 4) return null;
    px.set(data.subarray(0, width * height * 4));
  } else if (img.kind === 2) {
    // RGB_24BPP
    if (data.length < width * height * 3) return null;
    for (let i = 0, j = 0; i < width * height; i++) {
      px[i * 4] = data[j++];
      px[i * 4 + 1] = data[j++];
      px[i * 4 + 2] = data[j++];
      px[i * 4 + 3] = 255;
    }
  } else if (img.kind === 1) {
    // GRAYSCALE_1BPP — rows padded to whole bytes, set bit = white.
    const rowBytes = Math.ceil(width / 8);
    if (data.length < rowBytes * height) return null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = data[y * rowBytes + (x >> 3)];
        const on = (byte >> (7 - (x & 7))) & 1;
        const v = on ? 255 : 0;
        const o = (y * width + x) * 4;
        px[o] = v;
        px[o + 1] = v;
        px[o + 2] = v;
        px[o + 3] = 255;
      }
    }
  } else {
    return null;
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Resolve an XObject from a pdf.js object store without ever throwing. */
function getPdfjsObject(
  store: { get: (id: string, cb: (data: unknown) => void) => unknown },
  objId: string,
): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    try {
      store.get(objId, (data: unknown) => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export function PdfExtractImagesClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanningPage, setScanningPage] = useState<number | null>(null);

  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [capped, setCapped] = useState(false);
  const [done, setDone] = useState(false);

  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  // Bumped on reset / new file so an in-flight scan stops cleanly.
  const genRef = useRef(0);
  // Every object URL we create, so reset/unmount can revoke them all.
  const urlsRef = useRef<string[]>([]);

  const revokeAll = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
  }, []);

  useEffect(
    () => () => {
      genRef.current++;
      revokeAll();
    },
    [revokeAll],
  );

  const reset = useCallback(() => {
    genRef.current++;
    revokeAll();
    setFileName(null);
    setFileSize(0);
    setPageCount(0);
    setLoading(false);
    setLoadError(null);
    setScanningPage(null);
    setImages([]);
    setSkipped(0);
    setCapped(false);
    setDone(false);
    setZipping(false);
    setZipError(null);
  }, [revokeAll]);

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

        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({
          data: new Uint8Array(buffer),
        }).promise;
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }

        setPageCount(doc.numPages);
        setLoading(false);

        const OPS = pdfjs.OPS;
        const imageOps = new Set<number>([
          OPS.paintImageXObject,
          OPS.paintImageXObjectRepeat,
        ]);
        const seen = new Set<string>();
        let failed = 0;
        let total = 0;
        let hitCap = false;

        for (let p = 1; p <= doc.numPages && !hitCap; p++) {
          if (genRef.current !== gen) {
            void doc.destroy();
            return;
          }
          setScanningPage(p);

          const page = await doc.getPage(p);
          let opList;
          try {
            opList = await page.getOperatorList();
          } catch {
            failed++;
            page.cleanup();
            continue;
          }

          for (let i = 0; i < opList.fnArray.length; i++) {
            if (genRef.current !== gen) {
              void doc.destroy();
              return;
            }
            const fn = opList.fnArray[i];
            const isInline = fn === OPS.paintInlineImageXObject;
            if (!imageOps.has(fn) && !isInline) continue;

            let raw: unknown = null;
            let id: string;
            if (isInline) {
              // Inline images carry their data directly in the args.
              raw = opList.argsArray[i]?.[0] ?? null;
              id = `p${p}-inline-${i}`;
            } else {
              const objId = opList.argsArray[i]?.[0];
              if (typeof objId !== "string" || seen.has(objId)) continue;
              seen.add(objId);
              id = objId;
              // Document-wide images live in commonObjs ("g_" prefix).
              const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
              raw = await getPdfjsObject(store, objId);
            }

            if (!raw || typeof raw !== "object") {
              failed++;
              continue;
            }
            const canvas = imageToCanvas(raw as PdfjsImageLike);
            if (!canvas) {
              failed++;
              continue;
            }
            const blob = await canvasToPngBlob(canvas);
            if (!blob) {
              failed++;
              continue;
            }
            if (genRef.current !== gen) {
              void doc.destroy();
              return;
            }

            const url = URL.createObjectURL(blob);
            urlsRef.current.push(url);
            const entry: ExtractedImage = {
              id,
              url,
              blob,
              width: canvas.width,
              height: canvas.height,
              page: p,
            };
            setImages((prev) => [...prev, entry]);
            total++;
            if (total >= MAX_IMAGES) {
              hitCap = true;
              break;
            }
          }
          page.cleanup();
        }

        void doc.destroy();
        if (genRef.current !== gen) return;
        setSkipped(failed);
        setCapped(hitCap);
        setScanningPage(null);
        setDone(true);
      } catch (err) {
        if (genRef.current !== gen) return;
        const name = (err as { name?: string } | null)?.name;
        setLoading(false);
        setScanningPage(null);
        setLoadError(
          name === "PasswordException"
            ? "This PDF is password protected. Unlock it first, then extract."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const baseName = (fileName ?? "document").replace(/\.pdf$/i, "") || "document";

  const saveOne = useCallback(
    (img: ExtractedImage, index: number) => {
      downloadBlob(img.blob, `${baseName}-p${img.page}-img${index + 1}.png`);
    },
    [baseName],
  );

  const saveZip = useCallback(async () => {
    if (images.length === 0 || zipping) return;
    setZipping(true);
    setZipError(null);
    const gen = genRef.current;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      images.forEach((img, i) => {
        zip.file(`${baseName}-p${img.page}-img${i + 1}.png`, img.blob);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      if (genRef.current !== gen) return;
      downloadBlob(blob, `${baseName}-images.zip`);
    } catch {
      setZipError("Could not build the ZIP archive. Try saving images individually.");
    } finally {
      setZipping(false);
    }
  }, [images, zipping, baseName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Recovers embedded images as PNG files."
        />
      </Panel>
    );
  }

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
        {scanningPage !== null && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Scanning {scanningPage}/{pageCount}
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

      {!loadError && !loading && (done || images.length > 0) && (
        <>
          {done && images.length === 0 ? (
            <Panel bodyClassName="flex flex-col items-center gap-2 p-6 text-center">
              <Images className="h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-foreground">No images found</p>
              <p className="text-xs text-muted-foreground">
                This PDF has no embedded images pdf.js could decode.
                {skipped > 0 &&
                  ` ${skipped} image${skipped === 1 ? "" : "s"} used an unsupported format.`}
              </p>
            </Panel>
          ) : (
            <>
              <Panel
                title={`Images (${images.length}${capped ? "+" : ""})`}
                bodyClassName="p-3"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((img, i) => (
                    <div
                      key={`${img.id}-${i}`}
                      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                    >
                      <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted p-2">
                        <img
                          src={img.url}
                          alt={`Image ${i + 1} from page ${img.page}`}
                          className="max-h-full max-w-full rounded-sm"
                          loading="lazy"
                          draggable={false}
                        />
                      </span>
                      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          p{img.page} · {img.width}×{img.height}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Save image ${i + 1} as PNG`}
                          onClick={() => saveOne(img, i)}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          PNG
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {(skipped > 0 || capped) && (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {capped &&
                      `Stopped at the first ${MAX_IMAGES} images to save memory. `}
                    {skipped > 0 &&
                      `${skipped} image${skipped === 1 ? "" : "s"} could not be decoded and ${skipped === 1 ? "was" : "were"} skipped.`}
                  </p>
                )}
              </Panel>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void saveZip()}
                  disabled={zipping || images.length === 0}
                  className="h-12 px-5"
                >
                  {zipping ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileArchive className="h-4 w-4" aria-hidden />
                  )}
                  Save all as ZIP
                </Button>
                <span className="text-xs text-muted-foreground">
                  {images.length} PNG{images.length === 1 ? "" : "s"}
                </span>
              </div>

              {zipError && (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
                  {zipError}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="pdf-extract-images">
      <PdfExtractImagesClient />
    </ToolPage>
  );
}
