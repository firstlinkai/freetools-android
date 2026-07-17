import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, ListPlus, Shuffle } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadText } from "@/lib/download";

type SortMode = "az" | "za" | "num-asc" | "num-desc" | "length" | "reverse" | "shuffle";

const SAMPLE = `banana 12
Apple 3
cherry
apple 3
Durian 100
  elderberry 7

fig 0.5
Banana 12`;

const NUMBER_RE = /-?\d+(?:\.\d+)?/;

function firstNumber(line: string): number | null {
  const m = NUMBER_RE.exec(line);
  return m ? Number(m[0]) : null;
}

function fisherYates(lines: string[]): string[] {
  const out = [...lines];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function SortListClient() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<SortMode>("az");
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trim, setTrim] = useState(true);
  const [dedupe, setDedupe] = useState(false);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [shuffleNonce, setShuffleNonce] = useState(0);

  const linesIn = useMemo(() => (input ? input.split(/\r?\n/).length : 0), [input]);

  const output = useMemo(() => {
    if (!input) return [] as string[];
    let lines = input.split(/\r?\n/);
    if (trim) lines = lines.map((l) => l.trim());
    if (removeEmpty) lines = lines.filter((l) => l.trim().length > 0);
    if (dedupe) {
      const seen = new Set<string>();
      lines = lines.filter((l) => {
        const key = caseInsensitive ? l.toLowerCase() : l;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const key = (l: string) => (caseInsensitive ? l.toLowerCase() : l);
    // Array.prototype.sort is stable, so equal keys keep their input order.
    switch (mode) {
      case "az":
        return [...lines].sort((a, b) => key(a).localeCompare(key(b)));
      case "za":
        return [...lines].sort((a, b) => key(b).localeCompare(key(a)));
      case "num-asc":
      case "num-desc":
        return [...lines].sort((a, b) => {
          const na = firstNumber(a);
          const nb = firstNumber(b);
          if (na === null && nb === null) return 0; // both sink, stable
          if (na === null) return 1;
          if (nb === null) return -1;
          return mode === "num-asc" ? na - nb : nb - na;
        });
      case "length":
        return [...lines].sort((a, b) => a.length - b.length);
      case "reverse":
        return [...lines].reverse();
      case "shuffle":
        // shuffleNonce retriggers this memo when the Shuffle button is pressed.
        void shuffleNonce;
        return fisherYates(lines);
    }
  }, [input, mode, caseInsensitive, trim, dedupe, removeEmpty, shuffleNonce]);

  const outputText = useMemo(() => output.join("\n"), [output]);

  const checkbox = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="h-4 w-4 accent-accent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sort-mode">Sort mode</Label>
          <Select
            id="sort-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as SortMode)}
            className="w-52"
          >
            <option value="az">Alphabetical A-Z</option>
            <option value="za">Alphabetical Z-A</option>
            <option value="num-asc">Numeric ascending</option>
            <option value="num-desc">Numeric descending</option>
            <option value="length">Length (short to long)</option>
            <option value="reverse">Reverse lines</option>
            <option value="shuffle">Shuffle</option>
          </Select>
        </div>
        {mode === "shuffle" && (
          <Button size="sm" className="h-9" onClick={() => setShuffleNonce((n) => n + 1)}>
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-1.5">
          {checkbox("Case-insensitive", caseInsensitive, setCaseInsensitive)}
          {checkbox("Trim whitespace", trim, setTrim)}
          {checkbox("Remove duplicates", dedupe, setDedupe)}
          {checkbox("Remove empty lines", removeEmpty, setRemoveEmpty)}
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <ListPlus className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={"One item per line, e.g.\nbanana\napple\ncherry"}
            className="min-h-[22rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="List input"
          />
        </Panel>

        <Panel
          title="Sorted"
          actions={
            <>
              <CopyButton text={outputText} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!outputText}
                onClick={() => downloadText(outputText, "sorted.txt")}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input ? (
            <p className="p-2 text-sm text-muted-foreground">
              Paste a list on the left, one item per line. Numeric sort uses the first number found
              in each line; lines without a number sink to the bottom.
            </p>
          ) : (
            <>
              <pre className="max-h-[24rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {outputText}
              </pre>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {linesIn} {linesIn === 1 ? "line" : "lines"} in, {output.length} out
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
    <ToolPage slug="sort-list">
      <SortListClient />
    </ToolPage>
  );
}
