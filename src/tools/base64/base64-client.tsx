import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { ArrowDownUp, Download, FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { downloadBlob, downloadText, formatBytes } from "@/lib/download";

type Mode = "text" | "encode-file" | "decode-file";
type Direction = "encode" | "decode";

const SAMPLE_TEXT = "Hello from FreeTools! Unicode works too: café, 東京, 🚀";
const PREVIEW_CAP = 4000;

/** UTF-8 safe encode: string → UTF-8 bytes → binary string → base64. */
function encodeText(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/** UTF-8 safe decode: base64 → bytes → UTF-8 string. Throws on invalid input. */
function decodeText(b64: string): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(base64ToBytes(b64));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000; // keep fromCharCode argument counts safe
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

/** Accepts standard or URL-safe base64, with or without padding/whitespace. */
function base64ToBytes(input: string): Uint8Array {
  let normalized = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Strips a data:<mime>;base64, prefix if present; returns [payload, mime|null]. */
function splitDataUri(input: string): [string, string | null] {
  const m = /^\s*data:([^;,]*)(?:;[^,]*)?,/i.exec(input);
  if (!m) return [input, null];
  return [input.slice(m[0].length), m[1] || null];
}

const MODES: { id: Mode; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "encode-file", label: "File → Base64" },
  { id: "decode-file", label: "Base64 → File" },
];

export function Base64Client() {
  const [mode, setMode] = useState<Mode>("text");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={cn(
              "h-9 flex-1 rounded-md px-3 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === m.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "text" && <TextMode />}
      {mode === "encode-file" && <EncodeFileMode />}
      {mode === "decode-file" && <DecodeFileMode />}
    </div>
  );
}

function TextMode() {
  const [direction, setDirection] = useState<Direction>("encode");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { output: "", error: null as string | null };
    try {
      if (direction === "encode") return { output: encodeText(input), error: null };
      const [payload] = splitDataUri(input);
      return { output: decodeText(payload), error: null };
    } catch (e) {
      return { output: "", error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, direction]);

  const swap = () => {
    setDirection((d) => (d === "encode" ? "decode" : "encode"));
    if (result.output && !result.error) setInput(result.output);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={swap}>
          <ArrowDownUp className="h-3.5 w-3.5" />
          {direction === "encode" ? "Encoding — switch to decode" : "Decoding — switch to encode"}
        </Button>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE_TEXT)}>
          <FileText className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={direction === "encode" ? "Plain text" : "Base64 input"}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={
              direction === "encode"
                ? "Type or paste text to encode. Any Unicode is fine."
                : "Paste Base64 (standard or URL-safe, data URIs accepted)."
            }
            className="min-h-[14rem] resize-y font-mono text-xs leading-relaxed"
            aria-label={direction === "encode" ? "Plain text input" : "Base64 input"}
          />
        </Panel>

        <Panel
          title={direction === "encode" ? "Base64 output" : "Decoded text"}
          actions={<CopyButton text={result.output} />}
        >
          {!input ? (
            <p className="p-2 text-sm text-muted-foreground">
              The {direction === "encode" ? "encoded" : "decoded"} result appears here as you type.
              Everything runs locally on this device.
            </p>
          ) : result.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Invalid Base64</p>
              <p className="mt-1 font-mono text-xs">{result.error}</p>
            </div>
          ) : (
            <pre className="max-h-[18rem] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {result.output}
            </pre>
          )}
        </Panel>
      </div>
    </>
  );
}

function EncodeFileMode() {
  const [file, setFile] = useState<{ name: string; type: string; size: number; b64: string } | null>(null);
  const [asDataUri, setAsDataUri] = useState(false);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      setFile({
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        b64: bytesToBase64(bytes),
      });
    } finally {
      setBusy(false);
    }
  };

  const full = file ? (asDataUri ? `data:${file.type};base64,${file.b64}` : file.b64) : "";

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={onFiles} hint="Any file type. Converted to Base64 in memory." />
      {busy && <p className="text-sm text-muted-foreground">Encoding…</p>}
      {file && (
        <Panel
          title={`${file.name} · ${formatBytes(file.size)} → ${formatBytes(full.length)} of Base64`}
          actions={
            <>
              <CopyButton text={() => full} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(full, `${file.name}.base64.txt`)}
              >
                <Download className="h-3.5 w-3.5" />
                Download .txt
              </Button>
            </>
          }
        >
          <label className="mb-2 flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={asDataUri}
              onChange={(e) => setAsDataUri(e.target.checked)}
            />
            Output as data URI (data:{file.type};base64,…)
          </label>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {full.length > PREVIEW_CAP ? `${full.slice(0, PREVIEW_CAP)}…` : full}
          </pre>
          {full.length > PREVIEW_CAP && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Preview truncated — Copy and Download always use the complete output.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function DecodeFileMode() {
  const [input, setInput] = useState("");
  const [filename, setFilename] = useState("decoded.bin");
  const [error, setError] = useState<string | null>(null);

  const info = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const [payload, mime] = splitDataUri(input);
      const bytes = base64ToBytes(payload);
      return { bytes, mime, error: null as string | null };
    } catch (e) {
      return { bytes: null, mime: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input]);

  const save = () => {
    if (!info?.bytes) return;
    setError(null);
    try {
      const type = info.mime ?? "application/octet-stream";
      // Copy into a fresh ArrayBuffer-backed view: TS 5.7 types Uint8Array over
      // ArrayBufferLike, which BlobPart rejects.
      downloadBlob(new Blob([new Uint8Array(info.bytes)], { type }), filename.trim() || "decoded.bin");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Base64 input">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder="Paste Base64 or a full data URI (data:image/png;base64,…) to turn it back into a file."
          className="min-h-[14rem] resize-y font-mono text-xs leading-relaxed"
          aria-label="Base64 input for file decoding"
        />
      </Panel>

      {info?.error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Invalid Base64</p>
          <p className="mt-1 font-mono text-xs">{info.error}</p>
        </div>
      )}

      {info?.bytes && (
        <Panel title={`Decoded: ${formatBytes(info.bytes.length)}${info.mime ? ` · ${info.mime}` : ""}`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <Label htmlFor="b64-filename">File name</Label>
              <Input
                id="b64-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                spellCheck={false}
                className="font-mono"
              />
            </div>
            <Button size="md" onClick={save}>
              <Download className="h-4 w-4" />
              Save file
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="base64">
      <Base64Client />
    </ToolPage>
  );
}
