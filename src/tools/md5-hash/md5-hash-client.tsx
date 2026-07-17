import { ToolPage } from "@/components/tool/tool-page";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Info, Loader2, Type, X } from "lucide-react";
import SparkMD5 from "spark-md5";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadText, formatBytes } from "@/lib/download";
import { cn } from "@/lib/utils";

type Mode = "text" | "file";

/** 2 MB slices keep memory flat even for 100 MB+ files. */
const CHUNK_SIZE = 2 * 1024 * 1024;

export function Md5HashClient() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this token cancels any in-flight chunked hash.
  const jobToken = useRef(0);

  const textHash = useMemo(() => (text ? SparkMD5.hash(text) : null), [text]);

  useEffect(() => {
    const token = ++jobToken.current;
    setError(null);
    setFileHash(null);
    setProgress(0);
    if (!file) {
      setHashing(false);
      return;
    }

    const run = async () => {
      setHashing(true);
      try {
        const spark = new SparkMD5.ArrayBuffer();
        const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
        for (let offset = 0, i = 0; offset < file.size || i === 0; offset += CHUNK_SIZE, i++) {
          const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
          if (jobToken.current !== token) return;
          spark.append(buf);
          setProgress(Math.round(((i + 1) / total) * 100));
          if (file.size === 0) break;
        }
        if (jobToken.current !== token) return;
        setFileHash(spark.end());
      } catch (e) {
        if (jobToken.current === token) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (jobToken.current === token) setHashing(false);
      }
    };
    void run();
  }, [file]);

  const modeButton = (m: Mode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mode === m
          ? "border-accent bg-accent-muted text-accent"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );

  const activeHash = mode === "text" ? textHash : fileHash;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {modeButton("text", <Type className="h-4 w-4" />, "Text")}
        {modeButton("file", <FileText className="h-4 w-4" />, "File")}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <p>
          MD5 is fine for checksums and duplicate detection, but it is broken for security.
          Use SHA-256 when you need a cryptographic hash.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Could not hash the file</p>
          <p className="mt-1 font-mono text-xs">{error}</p>
        </div>
      )}

      <Panel title={mode === "text" ? "Text input" : "File input"}>
        {mode === "text" ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="Type or paste text. The MD5 checksum updates as you type."
            className="min-h-[10rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="Text to hash"
          />
        ) : file ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Remove file" onClick={() => setFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {hashing && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    Hashing in 2 MB chunks…
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <FileDropzone
            onFiles={(files) => setFile(files[0] ?? null)}
            hint="Any file type. Large files are read in 2 MB chunks."
          />
        )}
      </Panel>

      <Panel
        title="MD5 checksum"
        actions={
          activeHash ? (
            <>
              <CopyButton text={activeHash} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadText(
                    mode === "file" && file ? `${activeHash}  ${file.name}\n` : `${activeHash}\n`,
                    "md5-checksum.txt",
                  )
                }
              >
                Download
              </Button>
            </>
          ) : undefined
        }
      >
        {!activeHash ? (
          <p className="p-2 text-sm text-muted-foreground">
            {mode === "text"
              ? "Type some text above to see its 32-character MD5 checksum."
              : hashing
                ? "Computing the checksum…"
                : "Pick a file above to compute its MD5 checksum."}
          </p>
        ) : (
          <code className="block break-all rounded-md bg-muted p-3 font-mono text-sm leading-relaxed text-foreground">
            {activeHash}
          </code>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="md5-hash">
      <Md5HashClient />
    </ToolPage>
  );
}
