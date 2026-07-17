import { ToolPage } from "@/components/tool/tool-page";
import { useMemo, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EXAMPLE = `The best writing is easy to skim. Readers rarely move word by word. They scan, they jump, and they settle only where something earns their attention.

Short sentences help. So do short paragraphs. A wall of text signals effort, and most readers will not volunteer that effort. When a paragraph carries six or seven sentences, it usually hides two smaller ideas that deserve their own space, and splitting them almost always improves the flow, because each idea gets room to breathe, and the reader gets a natural place to pause, which keeps momentum high and fatigue low.

Concrete words beat abstract ones. Write "the invoice failed" instead of "an unexpected condition impacted the billing process". Plain language is not dumbed down. It is respectful of the reader's time.

Finally, read your draft out loud. If you run out of breath, your reader ran out of patience two sentences ago.`;

const STOPWORDS = new Set([
  "this", "that", "these", "those", "with", "from", "have", "has", "had",
  "your", "yours", "their", "there", "they", "them", "then", "than",
  "will", "would", "could", "should", "into", "onto", "about", "after",
  "before", "when", "where", "which", "while", "what", "were", "been",
  "being", "because", "also", "just", "only", "very", "much", "more",
  "most", "some", "such", "each", "other", "over", "under", "between",
  "does", "doing", "done", "here", "many", "every", "even",
]);

const ABBREVIATIONS = [
  "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.", "St.",
  "vs.", "etc.", "e.g.", "i.e.", "approx.", "No.",
];

const FRE_BANDS = [
  { min: 0, max: 30, label: "Very difficult", tone: "hard" as const },
  { min: 30, max: 50, label: "Difficult", tone: "hard" as const },
  { min: 50, max: 60, label: "Fairly difficult", tone: "mid" as const },
  { min: 60, max: 70, label: "Standard", tone: "mid" as const },
  { min: 70, max: 80, label: "Fairly easy", tone: "easy" as const },
  { min: 80, max: 90, label: "Easy", tone: "easy" as const },
  { min: 90, max: 100.01, label: "Very easy", tone: "easy" as const },
];

const DOT_PLACEHOLDER = "@@DOT@@";

function protectAbbreviations(text: string): string {
  let out = text;
  for (const abbr of ABBREVIATIONS) {
    out = out.split(abbr).join(abbr.split(".").join(DOT_PLACEHOLDER));
  }
  return out;
}

function splitSentences(text: string): string[] {
  const protectedText = protectAbbreviations(text);
  return protectedText
    .split(/[.!?]+(?=\s|$)/)
    .map((s) => s.split(DOT_PLACEHOLDER).join(".").trim())
    .filter((s) => s.length > 0);
}

function countSyllables(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  const groups = word.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (word.endsWith("e") && !word.endsWith("le") && count > 1) count -= 1;
  return Math.max(1, count);
}

function getWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
}

function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);
  return w;
}

interface Analysis {
  words: number;
  sentences: number;
  paragraphs: number;
  syllables: number;
  fre: number;
  grade: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  readingTime: string;
  keyStems: Set<string>;
}

function analyze(text: string): Analysis | null {
  const words = getWords(text);
  if (words.length === 0) return null;
  const sentences = splitSentences(text);
  const sentenceCount = Math.max(1, sentences.length);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const wps = words.length / sentenceCount;
  const spw = syllables / words.length;
  const fre = 206.835 - 1.015 * wps - 84.6 * spw;
  const grade = 0.39 * wps + 11.8 * spw - 15.59;

  const minutes = words.length / 200;
  const readingTime =
    minutes < 1 ? `${Math.max(1, Math.round(minutes * 60))} sec` : `${Math.round(minutes)} min`;

  // Key phrases: frequency of significant terms, min length 4, top 8 stems.
  const freq = new Map<string, number>();
  for (const raw of words) {
    const clean = raw.toLowerCase().replace(/[^a-z]/g, "");
    if (clean.length < 4 || STOPWORDS.has(clean)) continue;
    const s = stem(clean);
    if (s.length < 4 || STOPWORDS.has(s)) continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  const keyStems = new Set(
    [...freq.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([s]) => s),
  );

  return {
    words: words.length,
    sentences: sentenceCount,
    paragraphs: paragraphs.length,
    syllables,
    fre: Math.max(0, Math.min(100, fre)),
    grade: Math.max(0, grade),
    avgWordsPerSentence: wps,
    avgSyllablesPerWord: spw,
    readingTime,
    keyStems,
  };
}

function freBand(score: number) {
  return FRE_BANDS.find((b) => score >= b.min && score < b.max) ?? FRE_BANDS[0];
}

function gradeCaption(grade: number): string {
  const g = Math.round(grade);
  if (g <= 1) return "Grade 1, readable by 6 to 7 year olds";
  if (g >= 13) return "College level, readable by 18+ year olds";
  return `Grade ${g}, readable by ${g + 5} to ${g + 6} year olds`;
}

/** Wraps occurrences of key stems in <strong>, keeping everything else plain text. */
function emphasize(paragraph: string, keyStems: Set<string>): ReactNode[] {
  if (keyStems.size === 0) return [paragraph];
  const tokens = paragraph.split(/(\s+)/);
  return tokens.map((token, i) => {
    const clean = token.toLowerCase().replace(/[^a-z]/g, "");
    if (clean.length >= 4 && keyStems.has(stem(clean))) {
      return <strong key={i}>{token}</strong>;
    }
    return <span key={i}>{token}</span>;
  });
}

const toneClass: Record<"easy" | "mid" | "hard", string> = {
  easy: "text-accent",
  mid: "text-foreground",
  hard: "text-danger",
};

export function ReadabilityClient() {
  const [text, setText] = useState("");
  const analysis = useMemo(() => analyze(text), [text]);
  const paragraphs = useMemo(
    () => text.split(/\n\s*\n/).filter((p) => p.trim().length > 0),
    [text],
  );

  const band = analysis ? freBand(analysis.fre) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Your text"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setText(EXAMPLE)}>
              <FileText className="h-3.5 w-3.5" />
              Load example
            </Button>
          }
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste an article, email, or blog draft. Analysis updates live."
            className="min-h-[320px] text-sm leading-relaxed"
          />
        </Panel>

        <Panel title="Readability score">
          {!analysis || !band ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Paste some text to get a Flesch Reading Ease score, grade level, and skimmability report.
              </p>
              <Button variant="outline" size="sm" onClick={() => setText(EXAMPLE)}>
                Try the example
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-5xl font-semibold tabular-nums">
                  {Math.round(analysis.fre)}
                </span>
                <span className={cn("text-lg font-semibold", toneClass[band.tone])}>
                  {band.label}
                </span>
              </div>

              <div>
                <div className="flex gap-1">
                  {FRE_BANDS.map((b) => (
                    <div
                      key={b.label}
                      title={`${b.label} (${b.min} to ${Math.min(100, Math.floor(b.max))})`}
                      className={cn(
                        "h-2 flex-1 rounded-full",
                        b.label === band.label ? "bg-accent" : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Very difficult</span>
                  <span>Very easy</span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {gradeCaption(analysis.grade)}
              </p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Words", value: analysis.words.toLocaleString() },
                  { label: "Sentences", value: analysis.sentences.toLocaleString() },
                  { label: "Paragraphs", value: analysis.paragraphs.toLocaleString() },
                  { label: "Read time", value: analysis.readingTime },
                ].map((t) => (
                  <div key={t.label} className="rounded-md border border-border bg-muted px-2 py-2.5 text-center">
                    <p className="font-mono text-sm font-semibold tabular-nums">{t.value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <p>
                  Avg words / sentence:{" "}
                  <span className="font-mono text-foreground">
                    {analysis.avgWordsPerSentence.toFixed(1)}
                  </span>
                </p>
                <p>
                  Avg syllables / word:{" "}
                  <span className="font-mono text-foreground">
                    {analysis.avgSyllablesPerWord.toFixed(2)}
                  </span>
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {analysis && (
        <Panel title="Skimmability preview">
          <div className="flex flex-col gap-4">
            {paragraphs.map((p, i) => {
              const sentenceCount = splitSentences(p).length;
              const dense = sentenceCount > 4;
              return (
                <div key={i} className={cn(dense && "border-l-2 border-danger pl-3")}>
                  {dense && (
                    <p className="mb-1 text-[11px] font-medium text-danger">
                      Dense: {sentenceCount} sentences
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">
                    {emphasize(p, analysis.keyStems)}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Bold = detected key phrases. Flagged blocks = more than 4 sentences.
          </p>
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="readability">
      <ReadabilityClient />
    </ToolPage>
  );
}
