import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatBytes } from "@/lib/download";
import { stripJpegMetadata, type StrippedSegment } from "./jpeg-strip";

interface Result {
  blob: Blob;
  url: string;
  filename: string;
  /** true = byte-level JPEG rewrite (pixels untouched) */
  lossless: boolean;
  removed: StrippedSegment[];
}

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

/** Decode to a canvas and re-encode — drops every metadata chunk. */
async function reencodeViaCanvas(file: File, mime: string): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode that image file."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
        mime,
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function RemoveExifClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resultUrlRef = useRef<string | null>(null);

  // Revoke the preview object URL when the result changes or on unmount.
  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [result]);

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file is not an image. Drop a JPEG, PNG, or WebP file.");
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
    setProcessing(true);
    try {
      const base = f.name.replace(/\.[^.]+$/, "") || "image";
      const isJpeg =
        f.type === "image/jpeg" || /\.jpe?g$/i.test(f.name);

      if (isJpeg) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const stripped = stripJpegMetadata(bytes);
        if (stripped) {
          const blob = new Blob([stripped.out as BlobPart], { type: "image/jpeg" });
          setResult({
            blob,
            url: URL.createObjectURL(blob),
            filename: `${base}-noexif.jpg`,
            lossless: true,
            removed: stripped.removed,
          });
          return;
        }
        // Unparseable JPEG — fall through to canvas re-encode.
      }

      const mime = f.type === "image/webp" ? "image/webp" : "image/png";
      const blob = await reencodeViaCanvas(f, mime);
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        filename: `${base}-noexif.${mime === "image/webp" ? "webp" : "png"}`,
        lossless: false,
        removed: [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process that file.");
      setFile(null);
    } finally {
      setProcessing(false);
    }
  }, []);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  if (!file) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={(f) => void handleFiles(f)}
          hint="JPEG metadata (EXIF, GPS, XMP…) is stripped losslessly. PNG and WebP are re-encoded."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const savedBytes = result ? file.size - result.blob.size : 0;

  return (
    <div className="space-y-4">
      <Panel
        title="Metadata removal"
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
      >
        {processing || !result ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Processing {file.name}…
          </p>
        ) : (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              {result.lossless ? (
                <span>
                  Metadata stripped <span className="font-semibold">losslessly</span> — image
                  pixels are byte-identical to the original.
                </span>
              ) : (
                <span>
                  Image re-encoded via canvas, which drops all embedded metadata. (Lossless
                  byte-level stripping applies to JPEG only.)
                </span>
              )}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Before</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>
              <div className="rounded-md bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">After</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatBytes(result.blob.size)}
                  {result.lossless && savedBytes > 0 && (
                    <span className="ml-1 text-xs font-normal text-accent">
                      -{formatBytes(savedBytes)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {result.lossless && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {result.removed.length === 0
                    ? "No metadata segments were found — this JPEG was already clean."
                    : `Removed ${result.removed.length} metadata segment${result.removed.length === 1 ? "" : "s"}:`}
                </p>
                {result.removed.length > 0 && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {result.removed.map((seg, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-xs"
                      >
                        <span className="text-foreground">{seg.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatBytes(seg.bytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="rounded border border-border p-1" style={CHECKERBOARD}>
              <img
                src={result.url}
                alt="Cleaned result"
                className="mx-auto max-h-72 w-auto max-w-full"
              />
            </div>

            <Button
              className="w-full"
              onClick={() => downloadBlob(result.blob, result.filename)}
            >
              <Download className="h-4 w-4" aria-hidden />
              Download clean image
            </Button>
            <p className="truncate text-center text-xs text-muted-foreground">
              {result.filename}
            </p>
          </div>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="remove-exif">
      <RemoveExifClient />
    </ToolPage>
  );
}
