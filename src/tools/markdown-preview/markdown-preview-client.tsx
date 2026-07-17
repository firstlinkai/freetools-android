import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, FileCode2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadText } from "@/lib/download";
import { markdownToDocument, markdownToHtml, parseMarkdown, renderBlocks } from "./markdown";

const SAMPLE = `# Markdown Preview

Write on the left, see the result **live** on the right — all rendered
*locally* with a compact built-in parser.

## Supported syntax

- **Bold**, *italic*, ~~strikethrough~~ and \`inline code\`
- [Links](https://www.example.com) and images (shown as labeled links)
- Ordered and unordered lists

1. First step
2. Second step

> Blockquotes work too — handy for callouts.

\`\`\`js
// Fenced code blocks keep their formatting
function greet(name) {
  return "Hello, " + name;
}
\`\`\`

---

Raw HTML like <script>alert(1)</script> is always shown as plain text,
never executed.`;

export function MarkdownPreviewClient() {
  const [input, setInput] = useState("");

  const blocks = useMemo(() => (input.trim() ? parseMarkdown(input) : []), [input]);
  const preview = useMemo(() => renderBlocks(blocks), [blocks]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Headings, emphasis, code, links, lists, quotes. Raw HTML is escaped, never rendered.
        </p>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <FileCode2 className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Markdown">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={"# Start typing Markdown…\n\nThe rendered preview updates live."}
            className="min-h-[22rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="Markdown input"
          />
        </Panel>

        <Panel
          title="Preview"
          actions={
            <>
              <CopyButton label="Copy HTML" text={() => (input.trim() ? markdownToHtml(input) : "")} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!input.trim()}
                onClick={() =>
                  downloadText(markdownToDocument(input), "document.html", "text/html")
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
              The rendered document appears here as you type. Use Copy HTML for the markup, or
              Download for a complete standalone .html file.
            </p>
          ) : (
            <div className="max-h-[30rem] overflow-auto rounded-md bg-muted p-4 text-sm text-foreground">
              {preview}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="markdown-preview">
      <MarkdownPreviewClient />
    </ToolPage>
  );
}
