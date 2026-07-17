import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { downloadText, formatBytes } from "@/lib/download";
import { loadPdfjs } from "@/lib/pdf";

function pageSeparator(page: number, total: number) {
  return `──────── Page ${page} of ${total} ────────`;
}

export function PdfExtractTextClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extractingPage, setExtractingPage] = useState<number | null>(null);

  const [text, setText] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [emptyPages, setEmptyPages] = useState(0);
  const [done, setDone] = useState(false);

  // Bumped on reset / new file so an in-flight extraction loop stops cleanly.
  const genRef = useRef(0);

  useEffect(
    () => () => {
      genRef.current++;
    },
    [],
  );

  const reset = useCallback(() => {
    genRef.current++;
    setFileName(null);
    setFileSize(0);
    setPageCount(0);
    setLoading(false);
    setLoadError(null);
    setExtractingPage(null);
    setText("");
    setCharCount(0);
    setEmptyPages(0);
    setDone(false);
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

        const parts: string[] = [];
        let empty = 0;

        for (let i = 1; i <= doc.numPages; i++) {
          if (genRef.current !== gen) {
            void doc.destroy();
            return;
          }
          setExtractingPage(i);

          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          let pageText = "";
          for (const item of content.items) {
            // getTextContent mixes TextItem and TextMarkedContent entries.
            if (!("str" in item)) continue;
            pageText += item.str;
            if (item.hasEOL) pageText += "\n";
          }
          pageText = pageText.replace(/[ \t]+\n/g, "\n").trim();
          if (pageText.length === 0) empty++;
          parts.push(`${pageSeparator(i, doc.numPages)}\n\n${pageText}`);
          page.cleanup();
        }

        void doc.destroy();
        if (genRef.current !== gen) return;

        const combined = parts.join("\n\n");
        setText(combined);
        setCharCount(combined.length);
        setEmptyPages(empty);
        setExtractingPage(null);
        setDone(true);
      } catch (err) {
        if (genRef.current !== gen) return;
        const name = (err as { name?: string } | null)?.name;
        setLoading(false);
        setExtractingPage(null);
        setLoadError(
          name === "PasswordException"
            ? "This PDF is password protected. Unlock it first, then extract."
            : "Could not read this file. It may be corrupted or not a valid PDF.",
        );
      }
    },
    [reset],
  );

  const download = useCallback(() => {
    if (!text) return;
    const baseName =
      (fileName ?? "document").replace(/\.pdf$/i, "") || "document";
    downloadText(text, `${baseName}.txt`);
  }, [text, fileName]);

  // ── Empty state ──────────────────────────────────────────────────────
  if (!fileName) {
    return (
      <Panel bodyClassName="p-6">
        <FileDropzone
          accept="application/pdf,.pdf"
          onFiles={(files) => void loadFile(files[0])}
          hint="PDF only. Pulls text from the PDF's text layer — scanned pages have none."
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
        {extractingPage !== null && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Extracting {extractingPage}/{pageCount}
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

      {done && (
        <>
          <Panel
            title="Extracted text"
            actions={<CopyButton text={() => text} />}
            bodyClassName="flex flex-col gap-2 p-3"
          >
            <Textarea
              readOnly
              value={text}
              rows={16}
              spellCheck={false}
              className="min-h-64 resize-y font-mono text-xs leading-relaxed"
              aria-label="Extracted PDF text"
            />
            <p className="text-xs text-muted-foreground">
              {charCount.toLocaleString()} characters across {pageCount} page
              {pageCount === 1 ? "" : "s"}
              {emptyPages > 0 &&
                ` · ${emptyPages} page${emptyPages === 1 ? "" : "s"} had no text layer (likely scanned images)`}
            </p>
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={download}
              disabled={text.length === 0}
              className="h-12 px-5"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download as .txt
            </Button>
            {charCount === 0 && (
              <span className="text-xs text-muted-foreground">
                No text found — this PDF may be a scan without a text layer.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="pdf-extract-text">
      <PdfExtractTextClient />
    </ToolPage>
  );
}
