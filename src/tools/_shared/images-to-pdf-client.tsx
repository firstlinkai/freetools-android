
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileDown,
  GripVertical,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";

type PageSize = "fit" | "a4" | "letter";

interface ImgItem {
  id: string;
  file: File;
  url: string;
}

// Points at 72 DPI.
const SIZES: Record<Exclude<PageSize, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};
const MARGIN = 36;

let counter = 0;
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `img-${++counter}`;

/** Decode a File into a bitmap so we know its intrinsic size. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

export function ImagesToPdfClient({
  accept,
  hint,
}: {
  accept: string;
  hint: string;
}) {
  const [items, setItems] = useState<ImgItem[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>("fit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const urlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const addFiles = useCallback((files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) {
      setError("Those files aren't images.");
      return;
    }
    setError(null);
    const added = imgs.map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return { id: nextId(), file, url };
    });
    setItems((prev) => [...prev, ...added]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setError(null);
  }, []);

  const build = useCallback(async () => {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();

      for (const item of items) {
        const type = item.file.type;
        let embedded;
        if (type === "image/png") {
          embedded = await pdf.embedPng(await item.file.arrayBuffer());
        } else if (type === "image/jpeg") {
          embedded = await pdf.embedJpg(await item.file.arrayBuffer());
        } else {
          // WebP/other → re-encode to PNG on a canvas first.
          const img = await loadImage(item.url);
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")?.drawImage(img, 0, 0);
          embedded = await pdf.embedPng(canvas.toDataURL("image/png"));
        }

        const iw = embedded.width;
        const ih = embedded.height;

        if (pageSize === "fit") {
          const page = pdf.addPage([iw, ih]);
          page.drawImage(embedded, { x: 0, y: 0, width: iw, height: ih });
        } else {
          const [baseW, baseH] = SIZES[pageSize];
          // Orient the page to match the image.
          const landscape = iw > ih;
          const pw = landscape ? baseH : baseW;
          const ph = landscape ? baseW : baseH;
          const page = pdf.addPage([pw, ph]);
          const maxW = pw - MARGIN * 2;
          const maxH = ph - MARGIN * 2;
          const scale = Math.min(maxW / iw, maxH / ih, 1);
          const w = iw * scale;
          const h = ih * scale;
          page.drawImage(embedded, {
            x: (pw - w) / 2,
            y: (ph - h) / 2,
            width: w,
            height: h,
          });
        }
      }

      const bytes = await pdf.save();
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        "images.pdf",
      );
    } catch {
      setError("Could not build the PDF. One of the images may be unreadable.");
    } finally {
      setBusy(false);
    }
  }, [items, busy, pageSize]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <FileDropzone accept={accept} multiple onFiles={addFiles} hint={hint} />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const totalSize = items.reduce((s, it) => s + it.file.size, 0);

  return (
    <div className="space-y-4">
      <Panel
        title={`${items.length} image${items.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        }
        bodyClassName="p-3"
      >
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== index) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2",
                dragIndex === index ? "border-accent opacity-60" : "border-border",
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.file.name}
                className="h-10 w-10 shrink-0 rounded border border-border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger" aria-label="Remove" onClick={() => remove(item.id)}>
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3">
          <FileDropzone
            accept={accept}
            multiple
            onFiles={addFiles}
            className="border-border/70 px-4 py-6"
            hint="Add more images"
          />
        </div>
      </Panel>

      <Panel title="Page layout" bodyClassName="p-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="page-size">Page size</Label>
          <Select
            id="page-size"
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSize)}
          >
            <option value="fit">Fit page to each image</option>
            <option value="a4">A4 (centered)</option>
            <option value="letter">US Letter (centered)</option>
          </Select>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void build()} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileDown className="h-4 w-4" aria-hidden />
          )}
          Create PDF
        </Button>
        <span className="text-xs text-muted-foreground">
          {items.length} page{items.length === 1 ? "" : "s"}, in this order.
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
