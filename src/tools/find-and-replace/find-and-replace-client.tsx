import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { downloadText } from "@/lib/download";

const SAMPLE = `The cat sat on the mat. The CAT chased the rat.
Concatenate is not about cats, but "cat" appears inside it.`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface FindResult {
  count: number;
  output: string;
  error: string | null;
}

function runFindReplace(
  text: string,
  find: string,
  replace: string,
  opts: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
): FindResult {
  if (!text || !find) return { count: 0, output: text, error: null };

  let source = opts.regex ? find : escapeRegExp(find);
  if (opts.wholeWord) source = `\\b(?:${source})\\b`;
  const flags = opts.caseSensitive ? "g" : "gi";

  let re: RegExp;
  try {
    re = new RegExp(source, flags);
  } catch (err) {
    return {
      count: 0,
      output: text,
      error: err instanceof Error ? err.message : "Invalid regular expression.",
    };
  }

  let count = 0;
  // matchAll advances past zero-length matches, so this cannot loop forever.
  for (const _m of text.matchAll(re)) {
    void _m;
    count++;
  }

  // In plain-text mode the replacement is literal, so $& etc. must not expand.
  const output = opts.regex ? text.replace(re, replace) : text.replace(re, () => replace);
  return { count, output, error: null };
}

export function FindAndReplaceClient() {
  const [input, setInput] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexMode, setRegexMode] = useState(false);

  const result = useMemo(
    () => runFindReplace(input, find, replace, { caseSensitive, wholeWord, regex: regexMode }),
    [input, find, replace, caseSensitive, wholeWord, regexMode],
  );

  const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
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
      <Panel
        title="Text"
        actions={
          <Button variant="outline" size="sm" onClick={() => setInput(SAMPLE)}>
            <FileText className="h-3.5 w-3.5" />
            Load sample
          </Button>
        }
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder="Paste the text to search in…"
          className="min-h-[12rem] resize-y text-sm leading-relaxed"
          aria-label="Text to search in"
        />
      </Panel>

      <Panel title="Find &amp; replace" bodyClassName="space-y-3 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr-find">Find</Label>
            <Input
              id="fr-find"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              spellCheck={false}
              placeholder={regexMode ? "e.g. c(a|o)t" : "Text to find"}
              className="h-12 font-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr-replace">Replace with</Label>
            <Input
              id="fr-replace"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              spellCheck={false}
              placeholder={regexMode ? "Use $1, $2 for capture groups" : "Replacement text"}
              className="h-12 font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {checkbox("Case-sensitive", caseSensitive, setCaseSensitive)}
          {checkbox("Whole word", wholeWord, setWholeWord)}
          {checkbox("Regex", regexMode, setRegexMode)}
          <span className="ml-auto text-sm">
            <span className="font-semibold tabular-nums">{result.count.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">
              {result.count === 1 ? "match" : "matches"}
            </span>
          </span>
        </div>

        {result.error && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Invalid pattern: {result.error}
          </div>
        )}
      </Panel>

      <Panel
        title="Result (all replaced)"
        actions={
          <>
            <CopyButton text={result.output} />
            <Button
              variant="secondary"
              size="sm"
              disabled={!result.output}
              onClick={() => downloadText(result.output, "replaced.txt")}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </>
        }
      >
        {!input ? (
          <p className="text-sm text-muted-foreground">
            The text with every match replaced appears here, live.
          </p>
        ) : (
          <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm leading-relaxed">
            {result.output}
          </pre>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="find-and-replace">
      <FindAndReplaceClient />
    </ToolPage>
  );
}
