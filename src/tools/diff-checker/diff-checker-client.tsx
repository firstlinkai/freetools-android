import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Above this many lines (per side, after trimming common edges) the O(n·m) LCS
 *  table gets too big, so we fall back to a line-by-line hash comparison. */
const LCS_MAX_LINES = 2000;
const RENDER_CAP = 5000;

type LineType = "same" | "add" | "del";
interface DiffLine {
  type: LineType;
  text: string;
}

const SAMPLE_A = `The quick brown fox
jumps over the lazy dog
and runs into the forest.
The end.`;

const SAMPLE_B = `The quick brown fox
leaps over the lazy dog
and runs into the forest,
never to be seen again.
The end.`;

/** Standard O(n·m) LCS on line arrays, returning a unified diff sequence. */
function lcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] vs b[j..], flattened row-major.
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

/** Fallback for very large inputs: pair lines by index and compare directly
 *  (each string comparison acts as the "hash" check). No alignment recovery,
 *  but O(n) time and memory. */
function hashDiff(a: string[], b: string[]): DiffLine[] {
  const out: DiffLine[] = [];
  const len = Math.max(a.length, b.length);
  for (let k = 0; k < len; k++) {
    const av = k < a.length ? a[k] : null;
    const bv = k < b.length ? b[k] : null;
    if (av !== null && bv !== null && av === bv) {
      out.push({ type: "same", text: av });
    } else {
      if (av !== null) out.push({ type: "del", text: av });
      if (bv !== null) out.push({ type: "add", text: bv });
    }
  }
  return out;
}

function computeDiff(
  original: string,
  changed: string,
): { lines: DiffLine[]; added: number; removed: number; approximate: boolean } {
  const a = original.split(/\r?\n/);
  const b = changed.split(/\r?\n/);

  // Trim common prefix/suffix first — cheap, and it shrinks the LCS problem.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const approximate = midA.length > LCS_MAX_LINES || midB.length > LCS_MAX_LINES;
  const middle = approximate ? hashDiff(midA, midB) : lcsDiff(midA, midB);

  const lines: DiffLine[] = [
    ...a.slice(0, start).map((text) => ({ type: "same" as const, text })),
    ...middle,
    ...a.slice(endA).map((text) => ({ type: "same" as const, text })),
  ];
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === "add") added++;
    else if (l.type === "del") removed++;
  }
  return { lines, added, removed, approximate };
}

export function DiffCheckerClient() {
  const [original, setOriginal] = useState("");
  const [changed, setChanged] = useState("");

  const diff = useMemo(() => {
    if (!original && !changed) return null;
    return computeDiff(original, changed);
  }, [original, changed]);

  const hasChanges = diff !== null && (diff.added > 0 || diff.removed > 0);
  const rendered = diff ? diff.lines.slice(0, RENDER_CAP) : [];

  const diffText = useMemo(() => {
    if (!diff) return "";
    return diff.lines
      .map((l) => (l.type === "add" ? "+ " : l.type === "del" ? "- " : "  ") + l.text)
      .join("\n");
  }, [diff]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Original"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOriginal(SAMPLE_A);
                setChanged(SAMPLE_B);
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Load sample
            </Button>
          }
        >
          <Textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            spellCheck={false}
            placeholder="Paste the original text…"
            className="min-h-[14rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="Original text"
          />
        </Panel>

        <Panel title="Changed">
          <Textarea
            value={changed}
            onChange={(e) => setChanged(e.target.value)}
            spellCheck={false}
            placeholder="Paste the changed text…"
            className="min-h-[14rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="Changed text"
          />
        </Panel>
      </div>

      <Panel
        title="Diff"
        actions={<CopyButton text={diffText} label="Copy diff" />}
        bodyClassName="p-0"
      >
        {!diff ? (
          <p className="p-3 text-sm text-muted-foreground">
            Paste text into both boxes — added lines show in green, removed lines in red.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-2 text-xs">
              <span className="font-semibold text-emerald-400">+{diff.added} added</span>
              <span className="font-semibold text-red-400">−{diff.removed} removed</span>
              {!hasChanges && (
                <span className="text-muted-foreground">The two texts are identical.</span>
              )}
              {diff.approximate && (
                <span className="text-muted-foreground">
                  Large input: fast line-by-line comparison used (moved lines may show as
                  removed + added).
                </span>
              )}
            </div>
            <div className="max-h-[26rem] overflow-auto p-1">
              <pre className="font-mono text-xs leading-relaxed">
                {rendered.map((l, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex min-w-max gap-2 rounded-sm px-2",
                      l.type === "add" && "bg-emerald-400/10 text-emerald-400",
                      l.type === "del" && "bg-red-400/10 text-red-400",
                      l.type === "same" && "text-muted-foreground",
                    )}
                  >
                    <span className="w-3 shrink-0 select-none">
                      {l.type === "add" ? "+" : l.type === "del" ? "−" : " "}
                    </span>
                    <span className="whitespace-pre">{l.text || " "}</span>
                  </div>
                ))}
              </pre>
              {diff.lines.length > RENDER_CAP && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Showing the first {RENDER_CAP.toLocaleString()} of{" "}
                  {diff.lines.length.toLocaleString()} lines. Use Copy diff to get everything.
                </p>
              )}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="diff-checker">
      <DiffCheckerClient />
    </ToolPage>
  );
}
