import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, FileJson } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadText, formatBytes } from "@/lib/download";

const SAMPLE = `{"name":"FreeTools","version":2,"private":true,"features":["json","yaml","regex"],"limits":{"maxDepth":32,"maxBytes":1048576},"maintainer":null,"stable":false,"score":9.75}`;

type IndentChoice = "2" | "4" | "tab" | "min";

type TokenType = "key" | "string" | "value" | "punct" | "ws";

interface Token {
  text: string;
  type: TokenType;
}

const TOKEN_CLASS: Record<TokenType, string> = {
  key: "text-accent",
  string: "text-foreground",
  value: "italic text-foreground/80",
  punct: "text-muted-foreground",
  ws: "",
};

/** Deep-sorts object keys alphabetically; arrays keep their order. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeysDeep(src[key]);
    return out;
  }
  return value;
}

/** Tokenizes already-valid formatted JSON into colorable spans. */
function tokenizeJson(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === '"') {
          j++;
          break;
        } else j++;
      }
      const text = src.slice(i, j);
      let k = j;
      while (k < src.length && /\s/.test(src[k])) k++;
      tokens.push({ text, type: src[k] === ":" ? "key" : "string" });
      i = j;
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      const text = m ? m[0] : ch;
      tokens.push({ text, type: "value" });
      i += text.length;
    } else if (/[{}[\],:]/.test(ch)) {
      tokens.push({ text: ch, type: "punct" });
      i++;
    } else if (/\s/.test(ch)) {
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), type: "ws" });
      i = j;
    } else {
      let j = i;
      while (j < src.length && /[a-z]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, Math.max(j, i + 1)), type: "value" });
      i = Math.max(j, i + 1);
    }
  }
  return tokens;
}

function locateError(input: string, message: string): string | null {
  const m = /at position (\d+)/.exec(message);
  if (!m) return null;
  const pos = Math.min(Number(m[1]), input.length);
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos; i++) {
    if (input[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return `Line ${line}, column ${col}`;
}

function byteSize(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function PrettifyJsonClient() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<IndentChoice>("2");
  const [sortKeys, setSortKeys] = useState(false);

  const result = useMemo(() => {
    if (!input.trim()) return { formatted: "", tokens: [] as Token[], error: null as string | null, location: null as string | null };
    try {
      let value: unknown = JSON.parse(input);
      if (sortKeys) value = sortKeysDeep(value);
      const space = indent === "2" ? 2 : indent === "4" ? 4 : indent === "tab" ? "\t" : undefined;
      const formatted = JSON.stringify(value, null, space) ?? "";
      return { formatted, tokens: tokenizeJson(formatted), error: null, location: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { formatted: "", tokens: [] as Token[], error: message, location: locateError(input, message) };
    }
  }, [input, indent, sortKeys]);

  const sizeBefore = useMemo(() => (input ? byteSize(input) : 0), [input]);
  const sizeAfter = useMemo(() => (result.formatted ? byteSize(result.formatted) : 0), [result.formatted]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="json-indent">Indent</Label>
          <Select
            id="json-indent"
            value={indent}
            onChange={(e) => setIndent(e.target.value as IndentChoice)}
            className="w-36"
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="tab">Tab</option>
            <option value="min">Minified</option>
          </Select>
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={sortKeys}
            onChange={(e) => setSortKeys(e.target.checked)}
          />
          Sort keys
        </label>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <FileJson className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={'Paste JSON here, e.g.\n{"name":"Ada","tags":["dev","math"],"active":true}'}
            className="min-h-[22rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="JSON input"
          />
          {input && (
            <p className="mt-2 text-[11px] text-muted-foreground">Input size: {formatBytes(sizeBefore)}</p>
          )}
        </Panel>

        <Panel
          title="Formatted"
          actions={
            <>
              <CopyButton text={result.formatted} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!result.formatted}
                onClick={() => downloadText(result.formatted, "formatted.json", "application/json")}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input.trim() ? (
            <p className="p-2 text-sm text-muted-foreground">
              Paste JSON on the left, or use Load sample. The formatted, color-coded result appears here instantly.
            </p>
          ) : result.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Invalid JSON</p>
              <p className="mt-1 font-mono text-xs">{result.error}</p>
              {result.location && <p className="mt-1 text-xs">{result.location}</p>}
            </div>
          ) : (
            <>
              <pre className="max-h-[26rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {result.tokens.map((t, i) => (
                  <span key={i} className={TOKEN_CLASS[t.type]}>
                    {t.text}
                  </span>
                ))}
              </pre>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatBytes(sizeBefore)} in, {formatBytes(sizeAfter)} out
              </p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="prettify-json">
      <PrettifyJsonClient />
    </ToolPage>
  );
}
