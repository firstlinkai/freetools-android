import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Separator = "-" | "_";

const SAMPLE = "Héllo Wörld! This is an Ünïcode-heavy Title — 100% ready for URLs?";

function slugify(text: string, sep: Separator): string {
  const sepRe = new RegExp(`\\${sep}{2,}`, "g");
  const trimRe = new RegExp(`^\\${sep}+|\\${sep}+$`, "g");
  return text
    .normalize("NFD")
    // Strip combining diacritical marks left over from NFD decomposition.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(sepRe, sep)
    .replace(trimRe, "");
}

export function SlugGeneratorClient() {
  const [input, setInput] = useState("");
  const [separator, setSeparator] = useState<Separator>("-");

  // Slugify each line independently so a pasted list of titles works too.
  const slugs = useMemo(() => {
    if (!input) return [] as string[];
    return input
      .split(/\r?\n/)
      .map((line) => slugify(line, separator))
      .filter((s, i, arr) => s.length > 0 || arr.length === 1);
  }, [input, separator]);

  const output = useMemo(() => slugs.join("\n"), [slugs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="slug-sep">Separator</Label>
          <Select
            id="slug-sep"
            value={separator}
            onChange={(e) => setSeparator(e.target.value as Separator)}
            className="w-40"
          >
            <option value="-">Hyphen (-)</option>
            <option value="_">Underscore (_)</option>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <FileText className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <Panel title="Text">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder={"Type a title to slugify, e.g.\nMy First Blog Post!\nCafé & Résumé Tips"}
          className="min-h-[10rem] resize-y text-sm leading-relaxed"
          aria-label="Text to slugify"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Lowercased, accents stripped (café &rarr; cafe), and anything that isn&apos;t a letter or
          digit becomes the separator. Each line is slugified on its own.
        </p>
      </Panel>

      <Panel title="Slug" actions={<CopyButton text={output} />}>
        {!input ? (
          <p className="text-sm text-muted-foreground">
            Your URL-ready slug appears here as you type.
          </p>
        ) : (
          <pre className="max-h-[16rem] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-sm leading-relaxed text-accent">
            {output || "(empty — no letters or digits found)"}
          </pre>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="slug-generator">
      <SlugGeneratorClient />
    </ToolPage>
  );
}
