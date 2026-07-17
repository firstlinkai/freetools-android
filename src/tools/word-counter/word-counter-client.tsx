import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/download";

const WORDS_PER_MINUTE = 200;

const SAMPLE = `Writing is thinking on paper. Anyone who thinks clearly can write clearly, about anything at all.

A second paragraph helps you see how paragraph counting works. Short sentences read fast. Long, winding sentences with many clauses take a little longer, don't they?`;

interface Stats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  bytes: number;
  readingSeconds: number;
}

function computeStats(text: string): Stats {
  if (!text) {
    return {
      words: 0,
      chars: 0,
      charsNoSpaces: 0,
      sentences: 0,
      paragraphs: 0,
      lines: 0,
      bytes: 0,
      readingSeconds: 0,
    };
  }
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Count characters as user-perceived code points, not UTF-16 units.
  const chars = [...text].length;
  const charsNoSpaces = [...text.replace(/\s/g, "")].length;
  const sentences = (text.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/gm) || []).filter((s) =>
    /\S/.test(s),
  ).length;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
  const lines = text.split(/\r?\n/).length;
  const bytes = new TextEncoder().encode(text).length;
  const readingSeconds = Math.ceil((words / WORDS_PER_MINUTE) * 60);
  return { words, chars, charsNoSpaces, sentences, paragraphs, lines, bytes, readingSeconds };
}

function formatReadingTime(seconds: number): string {
  if (seconds === 0) return "0 sec";
  if (seconds < 60) return `${seconds} sec`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${mins} min` : `${mins} min ${rest} sec`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function WordCounterClient() {
  const [input, setInput] = useState("");

  const stats = useMemo(() => computeStats(input), [input]);

  const tiles: { label: string; value: string }[] = [
    { label: "Words", value: stats.words.toLocaleString() },
    { label: "Characters", value: stats.chars.toLocaleString() },
    { label: "Chars (no spaces)", value: stats.charsNoSpaces.toLocaleString() },
    { label: "Sentences", value: stats.sentences.toLocaleString() },
    { label: "Paragraphs", value: stats.paragraphs.toLocaleString() },
    { label: "Lines", value: stats.lines.toLocaleString() },
    { label: "UTF-8 size", value: formatBytes(stats.bytes) },
    { label: "Reading time", value: formatReadingTime(stats.readingSeconds) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} />
        ))}
      </div>

      <Panel
        title="Text"
        actions={
          <>
            <CopyButton text={input} />
            <Button variant="outline" size="sm" onClick={() => setInput(SAMPLE)}>
              <FileText className="h-3.5 w-3.5" />
              Load sample
            </Button>
            <Button variant="ghost" size="sm" disabled={!input} onClick={() => setInput("")}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder="Type or paste text — every stat above updates live as you write."
          className="min-h-[18rem] resize-y text-sm leading-relaxed"
          aria-label="Text to analyze"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Reading time assumes {WORDS_PER_MINUTE} words per minute. Everything is computed on your
          device — nothing leaves it.
        </p>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="word-counter">
      <WordCounterClient />
    </ToolPage>
  );
}
