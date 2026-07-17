import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadText } from "@/lib/download";

type Unit = "paragraphs" | "sentences" | "words";

const MAX_COUNT = 500;

/** Classic lorem ipsum corpus (from Cicero's "De finibus", as traditionally scrambled). */
const CORPUS = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor " +
  "incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud " +
  "exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute " +
  "irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur " +
  "excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt " +
  "mollit anim id est laborum at vero eos accusamus iusto odio dignissimos ducimus " +
  "blanditiis praesentium voluptatum deleniti atque corrupti quos dolores quas " +
  "molestias excepturi occaecati cupiditate provident similique mollitia animi " +
  "laudantium totam rem aperiam eaque ipsa quae ab illo inventore veritatis quasi " +
  "architecto beatae vitae dicta explicabo nemo ipsam quia voluptas aspernatur aut " +
  "odit fugit consequuntur magni ratione sequi nesciunt neque porro quisquam dolorem " +
  "adipisci numquam eius modi tempora incidunt magnam quaerat etiam minima nostrum " +
  "ullam corporis suscipit laboriosam aliquid commodi consequatur autem vel eum iure " +
  "quam nihil molestiae illum quo"
).split(" ");

const CLASSIC_OPENING = ["Lorem", "ipsum", "dolor", "sit", "amet,", "consectetur", "adipiscing", "elit."];

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickWord(): string {
  return CORPUS[Math.floor(Math.random() * CORPUS.length)];
}

function makeSentence(): string {
  const len = randInt(8, 16);
  const words: string[] = [];
  for (let i = 0; i < len; i++) words.push(pickWord());
  // Sprinkle a comma into longer sentences.
  if (len >= 11) {
    const at = randInt(3, len - 3);
    words[at] = words[at] + ",";
  }
  const raw = words.join(" ");
  return raw[0].toUpperCase() + raw.slice(1) + ".";
}

function makeParagraph(): string {
  const n = randInt(4, 7);
  const sentences: string[] = [];
  for (let i = 0; i < n; i++) sentences.push(makeSentence());
  return sentences.join(" ");
}

function generate(unit: Unit, count: number, classicStart: boolean): string {
  switch (unit) {
    case "words": {
      const words: string[] = [];
      if (classicStart) {
        for (const w of CLASSIC_OPENING.slice(0, count)) {
          words.push(w.replace(/[.,]$/, ""));
        }
      }
      while (words.length < count) words.push(pickWord());
      return words.join(" ");
    }
    case "sentences": {
      const sentences: string[] = [];
      if (classicStart) sentences.push(CLASSIC_OPENING.join(" "));
      while (sentences.length < count) sentences.push(makeSentence());
      return sentences.join(" ");
    }
    case "paragraphs": {
      const paragraphs: string[] = [];
      for (let i = 0; i < count; i++) {
        let p = makeParagraph();
        if (i === 0 && classicStart) p = CLASSIC_OPENING.join(" ") + " " + p;
        paragraphs.push(p);
      }
      return paragraphs.join("\n\n");
    }
  }
}

export function LoremIpsumClient() {
  const [unit, setUnit] = useState<Unit>("paragraphs");
  const [countRaw, setCountRaw] = useState("3");
  const [classicStart, setClassicStart] = useState(true);
  const [nonce, setNonce] = useState(0);

  const count = useMemo(() => {
    const n = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(n, MAX_COUNT);
  }, [countRaw]);

  const output = useMemo(() => {
    // nonce retriggers this memo when the Regenerate button is pressed.
    void nonce;
    if (count === null) return "";
    return generate(unit, count, classicStart);
  }, [unit, count, classicStart, nonce]);

  const wordCount = useMemo(
    () => (output ? output.trim().split(/\s+/).length : 0),
    [output],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="lorem-unit">Generate</Label>
          <Select
            id="lorem-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="w-40"
          >
            <option value="paragraphs">Paragraphs</option>
            <option value="sentences">Sentences</option>
            <option value="words">Words</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="lorem-count">Count (max {MAX_COUNT})</Label>
          <Input
            id="lorem-count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={countRaw}
            onChange={(e) => setCountRaw(e.target.value)}
            className="w-28"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={classicStart}
            onChange={(e) => setClassicStart(e.target.checked)}
          />
          Start with &ldquo;Lorem ipsum dolor&hellip;&rdquo;
        </label>
        <Button className="h-12 sm:ml-auto" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" />
          Regenerate
        </Button>
      </div>

      <Panel
        title="Generated text"
        actions={
          <>
            <CopyButton text={output} />
            <Button
              variant="secondary"
              size="sm"
              disabled={!output}
              onClick={() => downloadText(output, "lorem-ipsum.txt")}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </>
        }
      >
        {count === null ? (
          <p className="text-sm text-muted-foreground">Enter a count of 1 or more.</p>
        ) : (
          <>
            <div className="max-h-[26rem] space-y-4 overflow-auto rounded-md bg-muted p-3 text-sm leading-relaxed">
              {output.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {wordCount.toLocaleString()} words, {output.length.toLocaleString()} characters.
              Generated on your device from the classic lorem corpus.
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="lorem-ipsum">
      <LoremIpsumClient />
    </ToolPage>
  );
}
