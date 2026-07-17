import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Info, LockOpen, Loader2, RotateCcw } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBlob, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

// Render at 2× for crisp text in the rebuilt (rasterized) PDF.
const RENDER_SCALE = 2;

export function UnlockPdfClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
    setPassword("");
    setBusy(false);
    setProgress(null);
    setError(null);
    setDone(false);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setError("That file isn't a PDF.");
      return;
    }
    setError(null);
    setDone(false);
    setPassword("");
    setFileName(file.name);
    setFileSize(file.size);
    bufferRef.current = await file.arrayBuffer();
  }, []);

  const unlock = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const gen = ++genRef.current;

    try {
      const pdfjs = await loadPdfjs();
      const { PDFDocument } = await import("pdf-lib");

      const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer.slice(0)),
        password,
      }).promise;
      if (genRef.current !== gen) {
        void doc.destroy();
        return;
      }

      const out = await PDFDocument.create();
      setProgress({ done: 0, total: doc.numPages });

      for (let i = 1; i <= doc.numPages; i++) {
        if (genRef.current !== gen) {
          void doc.destroy();
          return;
        }
        const page = await doc.getPage(i);
        const pointVp = page.getViewport({ scale: 1 }); // 1 unit = 1 pt
        const renderVp = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(renderVp.width);
        canvas.height = Math.ceil(renderVp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff"; // flatten transparency for JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        page.cleanup();

        const embedded = await out.embedJpg(jpegDataUrl);
        const p = out.addPage([pointVp.width, pointVp.height]);
        p.drawImage(embedded, {
          x: 0,
          y: 0,
          width: pointVp.width,
          height: pointVp.height,
        });
        if (genRef.current !== gen) return;
        setProgress({ done: i, total: doc.numPages });
      }

      void doc.destroy();
      const bytes = await out.save();
      if (genRef.current !== gen) return;

      const base = (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `${base}-unlocked.pdf`,
      );
      setDone(true);
    } catch (err) {
      if (genRef.current !== gen) return;
      const name = (err as { name?: string } | null)?.name;
      setError(
        name === "PasswordException"
          ? "Incorrect or missing password — enter the password and try again."
          : "Could not unlock this PDF. It may be corrupted or not a valid PDF.",
      );
    } finally {
      if (genRef.current === gen) {
        setBusy(false);
        setProgress(null);
      }
    }
  }, [busy, password, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <div className="space-y-3">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="Drop a password-protected PDF, then enter its password."
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
      <Panel bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(fileSize)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start over
        </Button>
      </Panel>

      <Panel title="Password" bodyClassName="space-y-4 p-4">
        <form
          className="max-w-sm space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <Label htmlFor="pw">PDF password</Label>
          <Input
            id="pw"
            type="password"
            autoComplete="off"
            placeholder="Enter the password"
            value={password}
            disabled={busy}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
          />
        </form>

        <Button onClick={() => void unlock()} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {progress ? `Unlocking ${progress.done}/${progress.total}` : "Unlocking"}
            </>
          ) : (
            <>
              <LockOpen className="h-4 w-4" aria-hidden />
              Unlock &amp; download
            </>
          )}
        </Button>

        {done && !busy && (
          <p className="inline-flex items-center gap-1.5 text-sm text-accent">
            <Check className="h-4 w-4" aria-hidden />
            Done — your unlocked PDF has been downloaded.
          </p>
        )}

        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            The unlocked PDF is rebuilt from rasterized page images, so the
            selectable text layer is removed — a lossless client-side decrypt
            isn&apos;t available in the browser. This reliably produces a
            password-free PDF you can open, view, and print.
          </span>
        </div>
      </Panel>

      {done && !busy && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => void unlock()}>
            <Download className="h-4 w-4" aria-hidden />
            Download again
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="unlock-pdf">
      <UnlockPdfClient />
    </ToolPage>
  );
}
