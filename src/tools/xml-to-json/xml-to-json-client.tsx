import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Code2, Download } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadText, formatBytes } from "@/lib/download";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<library name="Downtown branch">
  <book id="b1" available="true">
    <title>Structure and Interpretation</title>
    <author>Abelson</author>
    <author>Sussman</author>
    <year>1985</year>
  </book>
  <book id="b2">
    <title>The Art of Computer Programming</title>
    <author>Knuth</author>
  </book>
  <note>Opening hours: 9-17</note>
</library>`;

/**
 * Element → JSON value. Attributes become "@name" keys, mixed text becomes
 * "#text", repeated sibling elements collapse into arrays, and text-only
 * elements without attributes become plain strings.
 */
function elementToValue(el: Element): unknown {
  const obj: Record<string, unknown> = {};

  for (const attr of Array.from(el.attributes)) obj[`@${attr.name}`] = attr.value;

  let text = "";
  for (const node of Array.from(el.childNodes)) {
    // 3 = TEXT_NODE, 4 = CDATA_SECTION_NODE
    if (node.nodeType === 3 || node.nodeType === 4) text += node.textContent ?? "";
  }
  text = text.trim();

  for (const child of Array.from(el.children)) {
    const name = child.tagName;
    const value = elementToValue(child);
    if (name in obj) {
      const existing = obj[name];
      if (Array.isArray(existing)) existing.push(value);
      else obj[name] = [existing, value];
    } else {
      obj[name] = value;
    }
  }

  if (el.children.length === 0 && Object.keys(obj).length === 0) return text;
  if (text) obj["#text"] = text;
  return obj;
}

interface Conversion {
  json: string;
  error: string | null;
}

function convert(input: string): Conversion {
  if (!input.trim()) return { json: "", error: null };
  const doc = new DOMParser().parseFromString(input, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    // The browser's error element nests the useful message in text content.
    const message = (parseError.textContent ?? "XML parse error").replace(/\s+/g, " ").trim();
    return { json: "", error: message };
  }
  const root = doc.documentElement;
  const result = { [root.tagName]: elementToValue(root) };
  return { json: JSON.stringify(result, null, 2), error: null };
}

export function XmlToJsonClient() {
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
        <p className="text-xs text-muted-foreground">
          Attributes map to <code className="font-mono text-accent">@name</code>, mixed text to{" "}
          <code className="font-mono text-accent">#text</code>, repeated elements to arrays.
        </p>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <Code2 className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="XML input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={"Paste XML here, e.g.\n<user id=\"1\"><name>Ada</name></user>"}
            className="min-h-[16rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="XML input"
          />
          <div className="mt-3">
            <FileDropzone
              accept=".xml,text/xml,application/xml"
              onFiles={onFiles}
              hint="Or drop an .xml file"
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
              Paste XML on the left (or drop a file) and the JSON mapping appears here instantly —
              parsed locally with the browser's DOMParser.
            </p>
          ) : result.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Invalid XML</p>
              <p className="mt-1 font-mono text-xs">{result.error}</p>
            </div>
          ) : (
            <>
              <pre className="max-h-[24rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {result.json}
              </pre>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatBytes(new TextEncoder().encode(result.json).length)} of JSON
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
    <ToolPage slug="xml-to-json">
      <XmlToJsonClient />
    </ToolPage>
  );
}
