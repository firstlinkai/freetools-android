import { ToolPage } from "@/components/tool/tool-page";

import { useEffect, useState } from "react";
import { FileText, Loader2, Type, X } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadText, formatBytes } from "@/lib/download";
import { cn } from "@/lib/utils";

type Algo = "SHA-256" | "SHA-1" | "SHA-384" | "SHA-512";
type Mode = "text" | "file";

const ALGOS: Algo[] = ["SHA-256", "SHA-1", "SHA-384", "SHA-512"];

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

interface Digest {
  hex: string;
  base64: string;
}

export function Sha256HashClient() {
  const [mode, setMode] = useState<Mode>("text");
  const [algo, setAlgo] = useState<Algo>("SHA-256");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hashing, setHashing] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setError(null);
      const source =
        mode === "text"
          ? text
            ? new TextEncoder().encode(text)
            : null
          : file;
      if (!source) {
        setDigest(null);
        setHashing(false);
        return;
      }
      setHashing(true);
      try {
        // File.arrayBuffer() reads the whole file; crypto.subtle.digest has no
        // streaming API, so big files show the spinner until both finish.
        const data = source instanceof File ? await source.arrayBuffer() : source;
        if (cancelled) return;
        const buf = await crypto.subtle.digest(algo, data);
        if (cancelled) return;
        setDigest({ hex: toHex(buf), base64: toBase64(buf) });
      } catch (e) {
        if (!cancelled) {
          setDigest(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setHashing(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [mode, algo, text, file]);

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

  const outputRow = (label: string, value: string) => (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <CopyButton text={value} />
      </div>
      <code className="block break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
        {value}
      </code>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-40 flex-col gap-1">
          <Label htmlFor="hash-algo">Algorithm</Label>
          <Select
            id="hash-algo"
            value={algo}
            onChange={(e) => setAlgo(e.target.value as Algo)}
            className="w-40"
          >
            {ALGOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-1 items-center gap-2">
          {modeButton("text", <Type className="h-4 w-4" />, "Text")}
          {modeButton("file", <FileText className="h-4 w-4" />, "File")}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Could not hash the input</p>
          <p className="mt-1 font-mono text-xs">{error}</p>
        </div>
      )}

      <Panel title={mode === "text" ? "Text input" : "File input"}>
        {mode === "text" ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="Type or paste the text to hash. The digest updates as you type."
            className="min-h-[10rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="Text to hash"
          />
        ) : file ? (
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
        ) : (
          <FileDropzone
            onFiles={(files) => setFile(files[0] ?? null)}
            hint="Any file type. Hashed entirely on this device."
          />
        )}
      </Panel>

      <Panel
        title={`${algo} digest`}
        actions={
          digest ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadText(
                  `${algo}\nHex: ${digest.hex}\nBase64: ${digest.base64}\n`,
                  `${algo.toLowerCase().replace("-", "")}-digest.txt`,
                )
              }
            >
              Download
            </Button>
          ) : undefined
        }
      >
        {hashing ? (
          <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Hashing{file && mode === "file" ? ` ${formatBytes(file.size)}` : ""}…
          </div>
        ) : !digest ? (
          <p className="p-2 text-sm text-muted-foreground">
            {mode === "text"
              ? "Type some text above to see its digest in hex and Base64."
              : "Pick a file above to compute its digest in hex and Base64."}
          </p>
        ) : (
          <div className="space-y-4">
            {outputRow("Hex", digest.hex)}
            {outputRow("Base64", digest.base64)}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="sha256-hash">
      <Sha256HashClient />
    </ToolPage>
  );
}
