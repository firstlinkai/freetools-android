import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";

type CaseMode =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "alternating";

const MODES: { id: CaseMode; label: string }[] = [
  { id: "upper", label: "UPPERCASE" },
  { id: "lower", label: "lowercase" },
  { id: "title", label: "Title Case" },
  { id: "sentence", label: "Sentence case" },
  { id: "camel", label: "camelCase" },
  { id: "pascal", label: "PascalCase" },
  { id: "snake", label: "snake_case" },
  { id: "kebab", label: "kebab-case" },
  { id: "alternating", label: "aLtErNaTiNg" },
];

const SAMPLE = `The Quick Brown Fox jumps over the lazy dog.
convert THIS text into any case you need — camelCase, snake_case, and more.`;

/** Splits text into words, honoring spaces, punctuation, and camelCase boundaries. */
function toWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function capitalize(w: string): string {
  return w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

function titleCase(text: string): string {
  // Capitalize each word in place, preserving all whitespace and punctuation.
  return text.replace(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g, (w) => capitalize(w));
}

function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  // Capitalize the first letter of the text and after ., !, ? or a newline.
  return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])|(\n\s*[a-z])/g, (m) => m.toUpperCase());
}

function convert(text: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return titleCase(text);
    case "sentence":
      return sentenceCase(text);
    case "camel": {
      const words = toWords(text);
      return words.map((w, i) => (i === 0 ? w.toLowerCase() : capitalize(w))).join("");
    }
    case "pascal":
      return toWords(text).map(capitalize).join("");
    case "snake":
      return toWords(text)
        .map((w) => w.toLowerCase())
        .join("_");
    case "kebab":
      return toWords(text)
        .map((w) => w.toLowerCase())
        .join("-");
    case "alternating": {
      let out = "";
      let i = 0;
      for (const ch of text) {
        if (/[A-Za-z]/.test(ch)) {
          out += i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase();
          i++;
        } else {
          out += ch;
        }
      }
      return out;
    }
  }
}

export function TextCaseConverterClient() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<CaseMode>("upper");

  const output = useMemo(() => (input ? convert(input, mode) : ""), [input, mode]);

  return (
    <div className="space-y-4">
      <Panel
        title="Input"
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
          placeholder="Type or paste text to convert…"
          className="min-h-[10rem] resize-y text-sm leading-relaxed"
          aria-label="Text to convert"
        />
      </Panel>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "h-12 rounded-md border px-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === m.id
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Panel
        title="Output"
        actions={
          <>
            <CopyButton text={output} />
            <Button
              variant="secondary"
              size="sm"
              disabled={!output}
              onClick={() => downloadText(output, "converted.txt")}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </>
        }
      >
        {!input ? (
          <p className="text-sm text-muted-foreground">
            Pick a case above — the converted text appears here instantly as you type.
          </p>
        ) : (
          <pre className="max-h-[20rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm leading-relaxed">
            {output}
          </pre>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="text-case-converter">
      <TextCaseConverterClient />
    </ToolPage>
  );
}
