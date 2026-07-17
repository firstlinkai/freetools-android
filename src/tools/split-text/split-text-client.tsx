import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";

type SplitMode = "chars" | "words" | "lines" | "delimiter";

const RENDER_CAP = 200;
const JOINER = "\n\n---\n\n";

const SAMPLE = `The quick brown fox jumps over the lazy dog while the sun sets behind the hills. Every craft has its rhythm, and writing is no different: short bursts, long pauses, and the occasional flourish.

Splitting text is handy for tweets, SMS, changelogs, and pagination. Paste anything here, pick a mode, and each chunk gets its own copy button.`;

/** Turns \n, \t, and \\ typed by the user into real characters. */
function unescapeDelimiter(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "\\") out += "\\";
      else out += "\\" + next;
      i++;
    } else {
      out += s[i];
    }
  }
  return out;
}

function splitByChars(text: string, size: number, keepWords: boolean): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    // Backtrack to the last whitespace inside the chunk if we'd cut a word.
    if (keepWords && end < text.length && !/\s/.test(text[end]) && !/\s/.test(text[end - 1])) {
      for (let j = end - 1; j > i; j--) {
        if (/\s/.test(text[j])) {
          end = j;
          break;
        }
      }
    }
    const chunk = keepWords ? text.slice(i, end).trim() : text.slice(i, end);
    if (chunk.length > 0) chunks.push(chunk);
    i = end;
    if (keepWords) while (i < text.length && /\s/.test(text[i])) i++;
  }
  return chunks;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function SplitTextClient() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<SplitMode>("chars");
  const [countRaw, setCountRaw] = useState("280");
  const [delimiterRaw, setDelimiterRaw] = useState(",");
  const [keepWords, setKeepWords] = useState(true);

  const count = useMemo(() => {
    const n = Number.parseInt(countRaw, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }, [countRaw]);

  const result = useMemo<{ chunks: string[]; error: string | null }>(() => {
    if (!input) return { chunks: [], error: null };
    if (mode === "delimiter") {
      const delim = unescapeDelimiter(delimiterRaw);
      if (delim.length === 0) {
        return { chunks: [], error: "Enter a delimiter to split by, e.g. a comma or \\n." };
      }
      return { chunks: input.split(delim).filter((c) => c.length > 0), error: null };
    }
    if (count === null) {
      return { chunks: [], error: "Enter a count of 1 or more." };
    }
    switch (mode) {
      case "chars":
        return { chunks: splitByChars(input, count, keepWords), error: null };
      case "words": {
        const words = input.split(/\s+/).filter(Boolean);
        return { chunks: chunkArray(words, count).map((w) => w.join(" ")), error: null };
      }
      case "lines": {
        const lines = input.split(/\r?\n/);
        return { chunks: chunkArray(lines, count).map((l) => l.join("\n")), error: null };
      }
    }
  }, [input, mode, count, delimiterRaw, keepWords]);

  const totalChars = input.length;
  const totalWords = useMemo(
    () => (input.trim() ? input.trim().split(/\s+/).length : 0),
    [input],
  );

  const joined = useMemo(() => result.chunks.join(JOINER), [result.chunks]);
  const rendered = result.chunks.slice(0, RENDER_CAP);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="split-mode">Split mode</Label>
          <Select
            id="split-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as SplitMode)}
            className="w-48"
          >
            <option value="chars">By character count</option>
            <option value="words">By word count</option>
            <option value="lines">By line count</option>
            <option value="delimiter">By custom delimiter</option>
          </Select>
        </div>

        {mode !== "delimiter" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="split-count">
              {mode === "chars" ? "Characters" : mode === "words" ? "Words" : "Lines"} per chunk
            </Label>
            <Input
              id="split-count"
              type="number"
              min={1}
              value={countRaw}
              onChange={(e) => setCountRaw(e.target.value)}
              className="w-28"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor="split-delim">Delimiter (\n and \t work)</Label>
            <Input
              id="split-delim"
              value={delimiterRaw}
              onChange={(e) => setDelimiterRaw(e.target.value)}
              spellCheck={false}
              className="w-40 font-mono"
            />
          </div>
        )}

        {mode === "chars" && (
          <>
            <div className="flex items-center gap-1.5 pb-1.5">
              {[280, 160].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCountRaw(String(preset))}
                  className={cn(
                    "h-7 rounded-full border px-2.5 text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    countRaw === String(preset)
                      ? "border-accent bg-accent-muted text-accent"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {preset} chars
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={keepWords}
                onChange={(e) => setKeepWords(e.target.checked)}
              />
              Don&apos;t break words
            </label>
          </>
        )}

        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <FileText className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder="Paste text to split into chunks. Great for threading tweets (280 chars) or SMS (160 chars)."
            className="min-h-[22rem] resize-y text-sm leading-relaxed"
            aria-label="Text to split"
          />
        </Panel>

        <div className="min-w-0 space-y-3">
          <Panel
            title="Chunks"
            actions={
              <>
                <CopyButton text={joined} label="Copy all" />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!joined}
                  onClick={() => downloadText(joined, "chunks.txt")}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </>
            }
            bodyClassName="py-2.5"
          >
            {!input ? (
              <p className="text-sm text-muted-foreground">
                Chunk stats appear here once you paste some text.
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span>
                  <span className="font-semibold">{result.chunks.length}</span>{" "}
                  <span className="text-muted-foreground">
                    {result.chunks.length === 1 ? "chunk" : "chunks"}
                  </span>
                </span>
                <span>
                  <span className="font-semibold">{totalChars.toLocaleString()}</span>{" "}
                  <span className="text-muted-foreground">chars</span>
                </span>
                <span>
                  <span className="font-semibold">{totalWords.toLocaleString()}</span>{" "}
                  <span className="text-muted-foreground">words</span>
                </span>
              </div>
            )}
          </Panel>

          {input && result.error && (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{result.error}</div>
          )}

          {rendered.map((chunk, i) => (
            <Panel
              key={i}
              title={`Chunk ${i + 1} of ${result.chunks.length}, ${chunk.length} chars`}
              actions={<CopyButton text={chunk} />}
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{chunk}</p>
            </Panel>
          ))}

          {result.chunks.length > RENDER_CAP && (
            <p className="text-xs text-muted-foreground">
              Showing the first {RENDER_CAP} of {result.chunks.length} chunks. Copy all or Download
              to get every chunk.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="split-text">
      <SplitTextClient />
    </ToolPage>
  );
}
