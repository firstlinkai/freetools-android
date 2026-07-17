import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, Table2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadText, formatBytes } from "@/lib/download";

const SAMPLE = `id,name,email,active
1,Ada Lovelace,ada@example.com,true
2,Grace Hopper,grace@example.com,true
3,Alan Turing,alan@example.com,false`;

type DelimiterChoice = "auto" | "," | ";" | "\t" | "|";

const DELIMITER_LABEL: Record<string, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
};

interface Conversion {
  json: string;
  rowCount: number;
  detected: string | null;
  warnings: string[];
  error: string | null;
}

function convert(input: string, delimiter: DelimiterChoice, hasHeader: boolean): Conversion {
  const empty: Conversion = { json: "", rowCount: 0, detected: null, warnings: [], error: null };
  if (!input.trim()) return empty;

  const result = Papa.parse(input.replace(/\r\n/g, "\n"), {
    delimiter: delimiter === "auto" ? "" : delimiter,
    header: hasHeader,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const fatal = result.errors.find((e) => e.type === "Delimiter");
  if (fatal) return { ...empty, error: fatal.message };
  if (!Array.isArray(result.data) || result.data.length === 0)
    return { ...empty, error: "No rows found in the input." };

  const warnings = result.errors
    .slice(0, 5)
    .map((e) => `${e.message}${typeof e.row === "number" ? ` (row ${e.row + 1})` : ""}`);

  return {
    json: JSON.stringify(result.data, null, 2),
    rowCount: result.data.length,
    detected: result.meta.delimiter ?? null,
    warnings,
    error: null,
  };
}

export function CsvToJsonClient() {
  const [input, setInput] = useState("");
  const [delimiter, setDelimiter] = useState<DelimiterChoice>("auto");
  const [hasHeader, setHasHeader] = useState(true);

  const result = useMemo(() => convert(input, delimiter, hasHeader), [input, delimiter, hasHeader]);

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setInput(await file.text());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="csv-delimiter">Delimiter</Label>
          <Select
            id="csv-delimiter"
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value as DelimiterChoice)}
            className="w-40"
          >
            <option value="auto">Auto-detect</option>
            <option value=",">Comma ( , )</option>
            <option value=";">Semicolon ( ; )</option>
            <option value={"\t"}>Tab</option>
            <option value="|">Pipe ( | )</option>
          </Select>
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
          />
          First row is header
        </label>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <Table2 className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="CSV input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={"Paste CSV here, e.g.\nname,age\nAda,36\nGrace,85"}
            className="min-h-[16rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="CSV input"
          />
          <div className="mt-3">
            <FileDropzone
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              onFiles={onFiles}
              hint="Or drop a .csv / .tsv file"
              className="py-6"
            />
          </div>
        </Panel>

        <Panel
          title="JSON output"
          actions={
            <>
              <CopyButton text={result.json} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!result.json}
                onClick={() => downloadText(result.json, "data.json", "application/json")}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input.trim() ? (
            <p className="p-2 text-sm text-muted-foreground">
              Paste CSV on the left (or drop a file). With the header toggle on, each row becomes an
              object keyed by column name; off, each row becomes an array.
            </p>
          ) : result.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Cannot parse</p>
              <p className="mt-1 font-mono text-xs">{result.error}</p>
            </div>
          ) : (
            <>
              {result.warnings.length > 0 && (
                <div className="mb-2 rounded-md bg-danger/10 p-2 text-xs text-danger">
                  {result.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
              <pre className="max-h-[22rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {result.json}
              </pre>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                {delimiter === "auto" && result.detected
                  ? ` · detected delimiter: ${DELIMITER_LABEL[result.detected] ?? JSON.stringify(result.detected)}`
                  : ""}
                {" · "}
                {formatBytes(new TextEncoder().encode(result.json).length)}
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
    <ToolPage slug="csv-to-json">
      <CsvToJsonClient />
    </ToolPage>
  );
}
