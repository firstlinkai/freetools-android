import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob } from "@/lib/download";

type OutputFormat = "image/png" | "image/jpeg";

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808033 25%, transparent 25%), linear-gradient(-45deg, #80808033 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808033 75%), linear-gradient(-45deg, transparent 75%, #80808033 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

export function InvertImageClient() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("image");
  const [showOriginal, setShowOriginal] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [error, setError] = useState<string | null>(null);

  const displayRef = useRef<HTMLCanvasElement>(null);
  /** Full-resolution inverted pixels live here; display just blits from it. */
  const invertedRef = useRef<HTMLCanvasElement | null>(null);

  const handleFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image. Drop a PNG, JPEG, or WebP file.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Invert once, up front: 255 - v per channel, alpha untouched.
      const work = document.createElement("canvas");
      work.width = img.naturalWidth;
      work.height = img.naturalHeight;
      const ctx = work.getContext("2d");
      if (!ctx) {
        setError("Canvas is not available.");
        return;
      }
      ctx.drawImage(img, 0, 0);
      let imgData: ImageData | null = ctx.getImageData(0, 0, work.width, work.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(imgData, 0, 0);
      imgData = null; // release the large buffer reference
      invertedRef.current = work;
      setFileName(file.name.replace(/\.[^.]+$/, "") || "image");
      setShowOriginal(false);
      setImage(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Could not decode that image file.");
    };
    img.src = url;
  }, []);

  // Blit either the original or the inverted canvas onto the display canvas.
  useEffect(() => {
    const canvas = displayRef.current;
    const inverted = invertedRef.current;
    if (!canvas || !image || !inverted) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(showOriginal ? image : inverted, 0, 0);
  }, [image, showOriginal]);

  const save = () => {
    const inverted = invertedRef.current;
    if (!inverted) return;
    let source = inverted;
    if (format === "image/jpeg") {
      // JPEG has no alpha; composite over white first.
      const flat = document.createElement("canvas");
      flat.width = inverted.width;
      flat.height = inverted.height;
      const ctx = flat.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(inverted, 0, 0);
      source = flat;
    }
    source.toBlob(
      (blob) => {
        if (blob)
          downloadBlob(blob, `${fileName}-inverted.${format === "image/jpeg" ? "jpg" : "png"}`);
      },
      format,
      0.92,
    );
  };

  const reset = () => {
    setImage(null);
    setError(null);
    invertedRef.current = null;
  };

  if (!image) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
          hint="PNG, JPEG, or WebP. Every pixel flips to its negative the moment it loads."
        />
        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={`Preview (${image.naturalWidth} x ${image.naturalHeight}px)`}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            New image
          </Button>
        }
        bodyClassName="flex flex-col items-center gap-3 overflow-auto"
      >
        <div className="grid w-full grid-cols-2 gap-2">
          <Button
            variant={showOriginal ? "primary" : "secondary"}
            className="w-full"
            onClick={() => setShowOriginal(true)}
            aria-pressed={showOriginal}
          >
            Original
          </Button>
          <Button
            variant={!showOriginal ? "primary" : "secondary"}
            className="w-full"
            onClick={() => setShowOriginal(false)}
            aria-pressed={!showOriginal}
          >
            Inverted
          </Button>
        </div>
        <div className="inline-block max-w-full rounded border border-border" style={CHECKERBOARD}>
          <canvas ref={displayRef} className="block h-auto max-w-full" />
        </div>
      </Panel>

      <Panel title="Export">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invert-format">Format</Label>
            <Select
              id="invert-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
            >
              <option value="image/png">PNG (keeps transparency)</option>
              <option value="image/jpeg">JPEG (smaller, no alpha)</option>
            </Select>
          </div>
          <Button className="w-full" onClick={save}>
            <Download className="h-4 w-4" aria-hidden />
            Download inverted image
          </Button>
          <p className="truncate text-center text-xs text-muted-foreground">
            {fileName}-inverted.{format === "image/jpeg" ? "jpg" : "png"}
          </p>
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="invert-image">
      <InvertImageClient />
    </ToolPage>
  );
}
