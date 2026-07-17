import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";

type TargetFormat = "image/png" | "image/jpeg" | "image/webp";

const TARGETS: { value: TargetFormat; label: string; ext: string }[] = [
  { value: "image/png", label: "PNG", ext: "png" },
  { value: "image/jpeg", label: "JPEG", ext: "jpg" },
  { value: "image/webp", label: "WebP", ext: "webp" },
];

/** Human label for a MIME type; falls back gracefully for exotic inputs. */
function formatLabel(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "image/bmp": "BMP",
    "image/svg+xml": "SVG",
    "image/avif": "AVIF",
  };
  return map[mime] ?? (mime.split("/")[1]?.toUpperCase() || "Image");
}

interface Source {
  file: File;
  img: HTMLImageElement;
  url: string;
  mime: string;
}

interface Converted {
  blob: Blob;
  url: string;
}

export function ImageFormatConverterClient() {
  const [source, setSource] = useState<Source | null>(null);
  const [target, setTarget] = useState<TargetFormat>("image/webp");
  const [converted, setConverted] = useState<Converted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const srcUrlRef = useRef<string | null>(null);
  const outUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current);
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    },
    [],
  );

  const handleFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file isn't an image. Drop a PNG, JPG, or WebP file.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current);
      srcUrlRef.current = url;
      // Default the target to something different from the source.
      setTarget(f.type === "image/png" ? "image/webp" : "image/png");
      setConverted(null);
      setSource({ file: f, img, url, mime: f.type || "image/*" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Re-encode the image whenever the source or target format changes.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setBusy(true);
    setError(null);

    const { img } = source;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      setError("Canvas is unavailable in this browser.");
      return;
    }
    // JPEG has no alpha channel — paint a white matte so transparent areas
    // don't turn black.
    if (target === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (cancelled) return;
        setBusy(false);
        if (!blob) {
          setError(
            "This browser couldn't encode that format. Try PNG or JPEG instead.",
          );
          setConverted(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
        outUrlRef.current = url;
        setConverted({ blob, url });
      },
      target,
      0.92,
    );

    return () => {
      cancelled = true;
    };
  }, [source, target]);

  const reset = useCallback(() => {
    if (srcUrlRef.current) {
      URL.revokeObjectURL(srcUrlRef.current);
      srcUrlRef.current = null;
    }
    setSource(null);
    setConverted(null);
    setError(null);
  }, []);

  const download = useCallback(() => {
    if (!converted || !source) return;
    const ext = TARGETS.find((t) => t.value === target)?.ext ?? "img";
    const base = source.file.name.replace(/\.[^.]+$/, "") || "image";
    downloadBlob(converted.blob, `${base}.${ext}`);
  }, [converted, source, target]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="Drop an image, then pick a target format: PNG, JPEG, or WebP."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const targetLabel = TARGETS.find((t) => t.value === target)?.label ?? "";
  const delta =
    converted && source.file.size > 0
      ? converted.blob.size - source.file.size
      : 0;

  return (
    <div className="space-y-4">
      {/* Format pickers */}
      <Panel
        title="Conversion"
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="p-4"
      >
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="source-format">Source format</Label>
            <Select id="source-format" value={source.mime} disabled>
              <option value={source.mime}>{formatLabel(source.mime)}</option>
            </Select>
          </div>
          <span className="hidden shrink-0 pb-2 text-muted-foreground sm:block">
            <ArrowRight className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="target-format">Target format</Label>
            <Select
              id="target-format"
              value={target}
              onChange={(e) => setTarget(e.target.value as TargetFormat)}
            >
              {TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Panel>

      {/* Preview */}
      <Panel
        title={`Preview · ${source.img.naturalWidth}×${source.img.naturalHeight}px`}
        bodyClassName="flex items-center justify-center overflow-auto bg-muted/30 p-3"
      >
        {busy ? (
          <span className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Converting…
          </span>
        ) : (
          <img
            src={converted?.url ?? source.url}
            alt={`${targetLabel} preview`}
            className="mx-auto max-h-[420px] w-auto max-w-full rounded border border-border"
          />
        )}
      </Panel>

      {/* Size summary */}
      {converted && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatLabel(source.mime)} {formatBytes(source.file.size)}
          </span>{" "}
          →{" "}
          <span className="font-medium text-foreground">
            {targetLabel} {formatBytes(converted.blob.size)}
          </span>
          {delta !== 0 && (
            <span className={delta < 0 ? "text-accent" : ""}>
              {" "}
              ({delta < 0 ? "−" : "+"}
              {formatBytes(Math.abs(delta))})
            </span>
          )}
        </p>
      )}

      {/* Prominent CTA */}
      <Button
        size="lg"
        onClick={download}
        disabled={!converted || busy}
        className="w-full sm:w-auto"
      >
        <Download className="h-4 w-4" aria-hidden />
        Download as {targetLabel}
      </Button>

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
    <ToolPage slug="image-format-converter">
      <ImageFormatConverterClient />
    </ToolPage>
  );
}
