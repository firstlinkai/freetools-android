import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileJson } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadText, formatBytes } from "@/lib/download";

const SAMPLE = `[
  {"id": 1, "name": "Ada Lovelace", "contact": {"email": "ada@example.com", "city": "London"}, "tags": ["math", "pioneer"]},
  {"id": 2, "name": "Grace Hopper", "contact": {"email": "grace@example.com", "city": "New York"}, "tags": ["navy"]},
  {"id": 3, "name": "Alan Turing", "contact": {"email": "alan@example.com"}, "active": true}
]`;

const PREVIEW_ROWS = 20;

/** Flattens nested objects/arrays into dot-notation keys: contact.email, tags.0 … */
function flatten(value: unknown, prefix: string, out: Record<string, unknown>) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out[prefix || "value"] = Array.isArray(value) ? "[]" : "{}";
      return;
    }
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix || "value"] = value === undefined ? null : value;
  }
}

interface Conversion {
  csv: string;
  fields: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  error: string | null;
}

function convert(input: string): Conversion {
  const empty: Conversion = { csv: "", fields: [], rows: [], rowCount: 0, error: null };
  if (!input.trim()) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
  // A single object is treated as a one-row table for convenience.
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) return { ...empty, error: "The JSON array is empty — nothing to convert." };

  const rows: Record<string, unknown>[] = [];
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const row: Record<string, unknown> = {};
    flatten(item, "", row);
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
    rows.push(row);
  }

  const csv = Papa.unparse(
    {
      fields,
      data: rows.map((r) => fields.map((f) => (f in r ? r[f] : ""))),
    },
    { newline: "\n" },
  );
  return { csv, fields, rows, rowCount: rows.length, error: null };
}

export function JsonToCsvClient() {
  const [input, setInput] = useState("");

  const result = useMemo(() => convert(input), [input]);

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setInput(await file.text());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <FileJson className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="JSON input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={'Paste a JSON array of objects, e.g.\n[{"name":"Ada","age":36},{"name":"Grace","age":85}]'}
            className="min-h-[16rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="JSON input"
          />
          <div className="mt-3">
            <FileDropzone
              accept=".json,application/json,text/plain"
              onFiles={onFiles}
              hint="Or drop a .json file"
              className="py-6"
            />
          </div>
        </Panel>

        <Panel
          title="CSV output"
          actions={
            <>
              <CopyButton text={result.csv} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!result.csv}
                onClick={() => downloadText(result.csv, "data.csv", "text/csv")}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input.trim() ? (
            <p className="p-2 text-sm text-muted-foreground">
              Paste a JSON array of objects (or drop a file). Nested keys are flattened with dot
              notation, and the CSV appears here instantly.
            </p>
          ) : result.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Cannot convert</p>
              <p className="mt-1 font-mono text-xs">{result.error}</p>
            </div>
          ) : (
            <>
              <pre className="max-h-[16rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {result.csv}
              </pre>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {result.rowCount} row{result.rowCount === 1 ? "" : "s"}, {result.fields.length} column
                {result.fields.length === 1 ? "" : "s"}, {formatBytes(new TextEncoder().encode(result.csv).length)}
              </p>
            </>
          )}
        </Panel>
      </div>

      {result.rows.length > 0 && (
        <Panel title={`Preview table (first ${Math.min(result.rowCount, PREVIEW_ROWS)} of ${result.rowCount})`}>
          <div className="max-h-80 overflow-auto rounded-md border border-border">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {result.fields.map((f) => (
                    <th key={f} className="whitespace-nowrap border-b border-border px-2 py-1.5 font-semibold text-accent">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <tr key={i} className="odd:bg-card even:bg-muted/40">
                    {result.fields.map((f) => (
                      <td key={f} className="max-w-56 truncate border-b border-border px-2 py-1 text-foreground/90">
                        {f in row && row[f] !== null ? String(row[f]) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="json-to-csv">
      <JsonToCsvClient />
    </ToolPage>
  );
}
