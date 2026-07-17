import { ToolPage } from "@/components/tool/tool-page";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Download } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadText } from "@/lib/download";

type Format = "markdown" | "html" | "text";

const FORMATS: Format[] = ["markdown", "html", "text"];
const LABELS: Record<Format, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "Plain text",
};
const OUT_META: Record<Format, { ext: string; mime: string }> = {
  markdown: { ext: "md", mime: "text/markdown" },
  html: { ext: "html", mime: "text/html" },
  text: { ext: "txt", mime: "text/plain" },
};

/* ---------- helpers ---------- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Inline markdown (bold, italic, code, links) → HTML. Input already HTML-escaped. */
function inlineMd(s: string): string {
  let out = s;
  // inline code first so its contents aren't further processed
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}">${t}</a>`);
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  return out;
}

function markdownToHtml(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(escapeHtml(para.join("\n"))).replace(/\n/g, "<br>")}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw;
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMd(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inlineMd(escapeHtml(ul[1].trim()))}</li>`);
      continue;
    }
    if (ol) {
      flushPara();
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${inlineMd(escapeHtml(ol[1].trim()))}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return out.join("\n");
}

function htmlToText(src: string): string {
  let s = src.replace(/\r\n?/g, "\n");
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "");
  // block-ish tags → line breaks
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*(p|div|h[1-6]|li|ul|ol|tr|table|blockquote|section|article|header|footer)\s*>/gi, "\n");
  s = s.replace(/<\s*(p|div|h[1-6]|tr|table|blockquote|section|article|header|footer)[^>]*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, "\n- ");
  // strip remaining tags
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  // collapse excess whitespace
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function plainToHtml(src: string): string {
  const blocks = src.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return blocks
    .map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br>")}</p>`)
    .filter((b) => b !== "<p></p>")
    .join("\n");
}

function htmlToMarkdown(src: string): string {
  let s = src.replace(/\r\n?/g, "\n");
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*h([1-6])[^>]*>([\s\S]*?)<\/\s*h\1\s*>/gi, (_m, lvl, inner) => {
    return `\n\n${"#".repeat(Number(lvl))} ${inner.trim()}\n\n`;
  });
  s = s.replace(/<\s*(strong|b)\s*>([\s\S]*?)<\/\s*\1\s*>/gi, "**$2**");
  s = s.replace(/<\s*(em|i)\s*>([\s\S]*?)<\/\s*\1\s*>/gi, "*$2*");
  s = s.replace(/<\s*code\s*>([\s\S]*?)<\/\s*code\s*>/gi, "`$1`");
  s = s.replace(/<\s*a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/\s*a\s*>/gi, "[$2]($1)");
  s = s.replace(/<\s*li[^>]*>([\s\S]*?)<\/\s*li\s*>/gi, (_m, inner) => `\n- ${inner.trim()}`);
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*(p|div|ul|ol|blockquote|section|article)\s*>/gi, "\n\n");
  s = s.replace(/<\s*(p|div|ul|ol|blockquote|section|article)[^>]*>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function convert(source: Format, target: Format, input: string): string {
  if (source === target) return input;
  if (source === "markdown" && target === "html") return markdownToHtml(input);
  if (source === "markdown" && target === "text") return htmlToText(markdownToHtml(input));
  if (source === "html" && target === "text") return htmlToText(input);
  if (source === "html" && target === "markdown") return htmlToMarkdown(input);
  if (source === "text" && target === "html") return plainToHtml(input);
  if (source === "text" && target === "markdown") return input; // plain text is valid markdown
  return input;
}

const EXAMPLE = `# Document Converter

Convert between **Markdown**, _HTML_, and plain text — all in your browser.

## Features

- Headings, **bold**, and *italic*
- Inline \`code\` and [links](https://example.com)
- Lists, paragraphs, and line breaks

1. Paste or drop a file
2. Pick source and target
3. Copy or download the result`;

/* ---------- component ---------- */

export function DocumentConverterClient() {
  const [source, setSource] = useState<Format>("markdown");
  const [target, setTarget] = useState<Format>("html");
  const [input, setInput] = useState("");

  const output = useMemo(() => {
    if (!input.trim()) return "";
    try {
      return convert(source, target, input);
    } catch {
      return "";
    }
  }, [source, target, input]);

  const swap = () => {
    setSource(target);
    setTarget(source);
    if (output) setInput(output);
  };

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    void f.text().then((t) => {
      setInput(t);
      const name = f.name.toLowerCase();
      if (name.endsWith(".html") || name.endsWith(".htm")) setSource("html");
      else if (name.endsWith(".md") || name.endsWith(".markdown")) setSource("markdown");
      else setSource("text");
    });
  };

  const meta = OUT_META[target];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="dc-source">Source</Label>
          <Select
            id="dc-source"
            value={source}
            onChange={(e) => setSource(e.target.value as Format)}
            className="w-40"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {LABELS[f]}
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
          <Label htmlFor="dc-target">Target</Label>
          <Select
            id="dc-target"
            value={target}
            onChange={(e) => setTarget(e.target.value as Format)}
            className="w-40"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {LABELS[f]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setSource("markdown"); setInput(EXAMPLE); }}>
          Load example
        </Button>
      </div>

      <FileDropzone
        accept=".txt,.md,.markdown,.html,.htm"
        onFiles={onFiles}
        hint="Drop a .txt, .md, or .html file — or just paste below."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Input (${LABELS[source]})`}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={`Paste ${LABELS[source]} here, drop a file above, or use Load example.`}
            className="min-h-[22rem] resize-y font-mono text-xs leading-relaxed"
            aria-label={`${LABELS[source]} input`}
          />
        </Panel>

        <Panel
          title={`Output (${LABELS[target]})`}
          actions={
            <>
              <CopyButton text={output} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!output}
                onClick={() => downloadText(output, `converted.${meta.ext}`, meta.mime)}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input.trim() ? (
            <p className="p-2 text-sm text-muted-foreground">
              Pick a source and target format, then paste or drop content on the left. The converted
              result appears here instantly. Conversions are best-effort and may not preserve every
              detail of complex documents.
            </p>
          ) : (
            <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {output}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="document-converter">
      <DocumentConverterClient />
    </ToolPage>
  );
}
