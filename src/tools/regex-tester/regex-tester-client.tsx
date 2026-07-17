import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CHEAT_SHEET, explainRegex } from "./regex-explain";

const FLAGS = [
  { flag: "g", hint: "global, find all matches" },
  { flag: "i", hint: "ignore case" },
  { flag: "m", hint: "multiline anchors" },
  { flag: "s", hint: "dot matches newline" },
  { flag: "u", hint: "unicode" },
  { flag: "y", hint: "sticky" },
] as const;

const MATCH_CAP = 5000;

const SAMPLE_PATTERN = "(?<user>\\w[\\w.]*)@(\\w+)\\.[a-z]{2,}";
const SAMPLE_FLAGS = "gi";
const SAMPLE_TEXT = `Reach the team at ada.lovelace@example.com or grace@navy.mil.
Invalid entries like not-an-email or @nowhere.com should not match.
Support is at help@omni.tools, around the clock.`;

interface MatchInfo {
  index: number;
  text: string;
  groups: (string | undefined)[];
  named: [string, string | undefined][];
}

interface Segment {
  text: string;
  hit: boolean;
}

export function RegexTesterClient() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("");

  const toggleFlag = (f: string) => {
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, "") : prev + f));
  };

  const regexResult = useMemo(() => {
    if (!pattern) return { regex: null as RegExp | null, error: null as string | null };
    try {
      return { regex: new RegExp(pattern, flags), error: null };
    } catch (e) {
      return { regex: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flags]);

  const matches = useMemo<{ list: MatchInfo[]; capped: boolean }>(() => {
    const { regex } = regexResult;
    if (!regex || !text) return { list: [], capped: false };
    // matchAll needs the g flag; force it for enumeration, then respect the
    // original semantics by keeping only the first match when g is absent.
    const enumerable = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
    const list: MatchInfo[] = [];
    let capped = false;
    // String.prototype.matchAll advances past zero-length matches on its own,
    // so this loop cannot spin; the cap only bounds huge result sets.
    for (const m of text.matchAll(enumerable)) {
      if (list.length >= MATCH_CAP) {
        capped = true;
        break;
      }
      list.push({
        index: m.index ?? 0,
        text: m[0],
        groups: m.slice(1),
        named: m.groups ? Object.entries(m.groups) : [],
      });
      if (!regex.global) break;
    }
    return { list, capped };
  }, [regexResult, text]);

  const segments = useMemo<Segment[]>(() => {
    if (!text) return [];
    const segs: Segment[] = [];
    let last = 0;
    for (const m of matches.list) {
      if (m.index > last) segs.push({ text: text.slice(last, m.index), hit: false });
      segs.push({ text: m.text, hit: true });
      last = m.index + m.text.length;
    }
    if (last < text.length) segs.push({ text: text.slice(last), hit: false });
    return segs;
  }, [text, matches]);

  const breakdown = useMemo(() => (pattern ? explainRegex(pattern) : []), [pattern]);

  const loadSample = () => {
    setPattern(SAMPLE_PATTERN);
    setFlags(SAMPLE_FLAGS);
    setText(SAMPLE_TEXT);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <Label htmlFor="rx-pattern">Pattern</Label>
          <Input
            id="rx-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
            placeholder="e.g. (\\w+)@(\\w+)\\.[a-z]{2,}"
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Flags</Label>
          <div className="flex items-center gap-1">
            {FLAGS.map(({ flag, hint }) => {
              const on = flags.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  aria-pressed={on}
                  title={hint}
                  className={cn(
                    "h-9 w-8 rounded-md border font-mono text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "border-accent bg-accent-muted font-semibold text-accent"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {flag}
                </button>
              );
            })}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadSample}>
          <Wand2 className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      {regexResult.error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Invalid pattern</p>
          <p className="mt-1 font-mono text-xs">{regexResult.error}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Test text">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="Paste the text to test against, or use Load sample."
            className="min-h-[14rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="Test text"
          />
        </Panel>

        <Panel title={`Highlighted matches (${matches.list.length}${matches.capped ? "+" : ""})`}>
          {!text ? (
            <p className="p-2 text-sm text-muted-foreground">
              Matches light up here as you type a pattern and test text.
            </p>
          ) : (
            <>
              <pre className="max-h-[14rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {segments.map((s, i) =>
                  s.hit ? (
                    <mark key={i} className="rounded bg-accent-muted px-0.5 text-foreground">
                      {s.text}
                    </mark>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </pre>
              {matches.capped && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Showing the first {MATCH_CAP} matches.
                </p>
              )}
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Match list">
          {matches.list.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {pattern && text && !regexResult.error
                ? "No matches in the test text."
                : "Each match appears here with its position and capture groups."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-auto">
              {matches.list.slice(0, 500).map((m, i) => (
                <li key={i} className="rounded-md border border-border bg-muted p-2 text-xs">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-muted-foreground">
                      #{i + 1} at index {m.index}
                    </span>
                    <code className="break-all font-mono text-foreground">
                      {m.text === "" ? "(empty match)" : m.text}
                    </code>
                  </div>
                  {(m.groups.length > 0 || m.named.length > 0) && (
                    <div className="mt-1 space-y-0.5 border-t border-border pt-1">
                      {m.groups.map((g, gi) => (
                        <div key={gi} className="flex gap-2">
                          <span className="shrink-0 text-muted-foreground">Group {gi + 1}:</span>
                          <code className="break-all font-mono">
                            {g === undefined ? "(no match)" : g}
                          </code>
                        </div>
                      ))}
                      {m.named.map(([name, g]) => (
                        <div key={name} className="flex gap-2">
                          <span className="shrink-0 text-accent">{name}:</span>
                          <code className="break-all font-mono">
                            {g === undefined ? "(no match)" : g}
                          </code>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {matches.list.length > 500 && (
                <li className="text-[11px] text-muted-foreground">
                  Listing the first 500 matches.
                </li>
              )}
            </ul>
          )}
        </Panel>

        <Panel title="Pattern breakdown">
          {breakdown.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              Type a pattern above to see each construct explained in plain English.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-auto">
              {breakdown.map((t, i) => (
                <li key={i} className="flex items-baseline gap-3 text-xs">
                  <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-accent">
                    {t.token}
                  </code>
                  <span className="text-muted-foreground">{t.meaning}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Cheat sheet">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {CHEAT_SHEET.map((group) => (
            <div key={group.group}>
              <h3 className="mb-1.5 text-xs font-semibold text-foreground">{group.group}</h3>
              <ul className="space-y-1">
                {group.rows.map((row) => (
                  <li key={row.token} className="flex items-baseline gap-2 text-xs">
                    <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-accent">
                      {row.token}
                    </code>
                    <span className="text-muted-foreground">{row.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="regex-tester">
      <RegexTesterClient />
    </ToolPage>
  );
}
