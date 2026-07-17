import { useMemo, useState } from "react";
import { ArrowLeftRight, Download, FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ToolPage } from "@/components/tool/tool-page";
import { downloadText } from "@/lib/download";
import {
  FORMAT_EXT,
  FORMAT_LABELS,
  FORMAT_MIME,
  parseSource,
  serializeTarget,
  type DataFormat,
} from "./convert";

const FORMATS: DataFormat[] = ["json", "yaml", "csv", "markdown"];

const EXAMPLES: Record<DataFormat, string> = {
  json: `[
  { "name": "Ada Lovelace", "role": "Engineer", "score": 98 },
  { "name": "Grace Hopper", "role": "Admiral", "score": 95 },
  { "name": "Alan Turing", "role": "Logician", "score": 97 }
]`,
  yaml: `- name: Ada Lovelace
  role: Engineer
  score: 98
- name: Grace Hopper
  role: Admiral
  score: 95
- name: Alan Turing
  role: Logician
  score: 97`,
  csv: `name,role,score
Ada Lovelace,Engineer,98
Grace Hopper,Admiral,95
Alan Turing,Logician,97`,
  markdown: `| name          | role     | score |
| ------------- | -------- | ----- |
| Ada Lovelace  | Engineer | 98    |
| Grace Hopper  | Admiral  | 95    |
| Alan Turing   | Logician | 97    |`,
};

export function FormatConverterClient() {
  const [source, setSource] = useState<DataFormat>("json");
  const [target, setTarget] = useState<DataFormat>("yaml");
  const [input, setInput] = useState("");

  const conversion = useMemo(() => {
    if (!input.trim()) return { output: "", error: null as string | null };
    try {
      const value = parseSource(source, input);
      return { output: serializeTarget(target, value), error: null };
    } catch (e) {
      return { output: "", error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, source, target]);

  const swap = () => {
    setSource(target);
    setTarget(source);
    if (conversion.output && !conversion.error) setInput(conversion.output);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="fc-source">Source</Label>
          <Select
            id="fc-source"
            value={source}
            onChange={(e) => setSource(e.target.value as DataFormat)}
            className="w-40"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9"
          onClick={swap}
          aria-label="Swap source and target"
          title="Swap source and target"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <div className="flex flex-col gap-1">
          <Label htmlFor="fc-target">Target</Label>
          <Select
            id="fc-target"
            value={target}
            onChange={(e) => setTarget(e.target.value as DataFormat)}
            className="w-40"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setInput(EXAMPLES[source])}
        >
          <FileText className="h-3.5 w-3.5" />
          Load example
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Input (${FORMAT_LABELS[source]})`}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={`Paste ${FORMAT_LABELS[source]} here, or use Load example.`}
            className="min-h-[22rem] resize-y font-mono text-xs leading-relaxed"
            aria-label={`${FORMAT_LABELS[source]} input`}
          />
        </Panel>

        <Panel
          title={`Output (${FORMAT_LABELS[target]})`}
          actions={
            <>
              <CopyButton text={conversion.output} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!conversion.output}
                onClick={() =>
                  downloadText(
                    conversion.output,
                    `converted.${FORMAT_EXT[target]}`,
                    FORMAT_MIME[target],
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input.trim() ? (
            <p className="p-2 text-sm text-muted-foreground">
              Pick a source and target format, then paste data on the left. The converted result
              appears here instantly. CSV and Markdown targets need tabular data, like an array of
              objects.
            </p>
          ) : conversion.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Conversion failed</p>
              <p className="mt-1 text-xs">{conversion.error}</p>
            </div>
          ) : (
            <pre className="max-h-[26rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {conversion.output}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="format-converter">
      <FormatConverterClient />
    </ToolPage>
  );
}
