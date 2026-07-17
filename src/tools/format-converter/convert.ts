import yaml from "js-yaml";
import Papa from "papaparse";

export type DataFormat = "json" | "yaml" | "csv" | "markdown";

export const FORMAT_LABELS: Record<DataFormat, string> = {
  json: "JSON",
  yaml: "YAML",
  csv: "CSV",
  markdown: "Markdown table",
};

export const FORMAT_EXT: Record<DataFormat, string> = {
  json: "json",
  yaml: "yaml",
  csv: "csv",
  markdown: "md",
};

export const FORMAT_MIME: Record<DataFormat, string> = {
  json: "application/json",
  yaml: "text/yaml",
  csv: "text/csv",
  markdown: "text/markdown",
};

const TABULAR_HINT =
  "CSV and Markdown tables need tabular data: an array of objects (rows with named columns) or an array of arrays (first row treated as the header).";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array of mixed or non-tabular items";
  return `a ${typeof value} value`;
}

interface Tabular {
  headers: string[];
  rows: unknown[][];
}

/** Normalizes a parsed value into headers + rows, or throws a shape error. */
function toTabular(value: unknown): Tabular {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${TABULAR_HINT} Got ${describe(value)}.`);
  }
  if (value.every((row) => Array.isArray(row))) {
    const arrays = value as unknown[][];
    const headers = arrays[0].map((h) => cellText(h));
    return { headers, rows: arrays.slice(1) };
  }
  if (value.every((row) => isPlainObject(row))) {
    const objects = value as Record<string, unknown>[];
    const headers: string[] = [];
    for (const row of objects) {
      for (const key of Object.keys(row)) if (!headers.includes(key)) headers.push(key);
    }
    return { headers, rows: objects.map((row) => headers.map((h) => row[h])) };
  }
  throw new Error(`${TABULAR_HINT} Got ${describe(value)}.`);
}

function coerceCell(raw: string): unknown {
  if (raw === "") return "";
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function splitMarkdownRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      current += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += s[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseMarkdownTable(text: string): Record<string, unknown>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes("|"));
  if (lines.length < 2) {
    throw new Error(
      "No Markdown table found. Expected a header row, a separator row like | --- | --- |, and data rows.",
    );
  }
  const headers = splitMarkdownRow(lines[0]);
  const separatorOk = /^[\s|:-]+$/.test(lines[1]) && lines[1].includes("-");
  const dataLines = lines.slice(separatorOk ? 2 : 1);
  return dataLines.map((line) => {
    const cells = splitMarkdownRow(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h || `column${i + 1}`] = coerceCell(cells[i] ?? "");
    });
    return row;
  });
}

function toMarkdownTable(value: unknown): string {
  const { headers, rows } = toTabular(value);
  const escape = (v: unknown) => cellText(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const headerCells = headers.map(escape);
  const bodyCells = rows.map((row) => headerCells.map((_, i) => escape(row[i])));
  const widths = headerCells.map((h, i) =>
    Math.max(3, h.length, ...bodyCells.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  const separator = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
  return [line(headerCells), separator, ...bodyCells.map(line)].join("\n");
}

export function parseSource(format: DataFormat, text: string): unknown {
  switch (format) {
    case "json":
      return JSON.parse(text);
    case "yaml":
      return yaml.load(text);
    case "csv": {
      const result = Papa.parse<Record<string, unknown>>(text.trim(), {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });
      if (result.errors.length > 0) {
        const err = result.errors[0];
        const where = typeof err.row === "number" ? ` (row ${err.row + 1})` : "";
        throw new Error(`CSV parse error: ${err.message}${where}`);
      }
      if (result.data.length === 0) throw new Error("CSV parse error: no data rows found.");
      return result.data;
    }
    case "markdown":
      return parseMarkdownTable(text);
  }
}

export function serializeTarget(format: DataFormat, value: unknown): string {
  switch (format) {
    case "json":
      return JSON.stringify(value, null, 2) ?? "";
    case "yaml":
      return yaml.dump(value, { lineWidth: 100 }).trimEnd();
    case "csv": {
      const { headers, rows } = toTabular(value);
      return Papa.unparse({
        fields: headers,
        data: rows.map((row) => row.map(cellText)),
      });
    }
    case "markdown":
      return toMarkdownTable(value);
  }
}
