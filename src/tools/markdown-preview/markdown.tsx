/**
 * Compact, safe Markdown renderer. The source is parsed into a small AST, then
 * rendered either as React elements (preview) or as an escaped HTML string
 * (Copy HTML / download). Raw HTML in the input is never interpreted — text
 * nodes are React-escaped in the preview and entity-escaped in the HTML
 * output, so no user markup can be injected.
 */

export type Inline =
  | { t: "text"; text: string }
  | { t: "code"; text: string }
  | { t: "strong" | "em" | "del"; children: Inline[] }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "img"; alt: string; src: string };

export type Block =
  | { t: "heading"; level: number; children: Inline[] }
  | { t: "para"; children: Inline[] }
  | { t: "codeblock"; lang: string; code: string }
  | { t: "quote"; children: Block[] }
  | { t: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { t: "hr" };

// ── Inline parsing ────────────────────────────────────────────────────

const INLINE_RULES: { re: RegExp; make: (m: RegExpExecArray) => Inline }[] = [
  { re: /^`([^`]+)`/, make: (m) => ({ t: "code", text: m[1] }) },
  {
    re: /^!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/,
    make: (m) => ({ t: "img", alt: m[1], src: m[2] }),
  },
  {
    re: /^\[([^\]]+)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/,
    make: (m) => ({ t: "link", href: m[2], children: parseInline(m[1]) }),
  },
  { re: /^\*\*(.+?)\*\*/, make: (m) => ({ t: "strong", children: parseInline(m[1]) }) },
  { re: /^__(.+?)__/, make: (m) => ({ t: "strong", children: parseInline(m[1]) }) },
  { re: /^~~(.+?)~~/, make: (m) => ({ t: "del", children: parseInline(m[1]) }) },
  { re: /^\*([^*\n]+)\*/, make: (m) => ({ t: "em", children: parseInline(m[1]) }) },
  { re: /^_([^_\n]+)_/, make: (m) => ({ t: "em", children: parseInline(m[1]) }) },
];

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  let i = 0;
  const flush = () => {
    if (plain) {
      out.push({ t: "text", text: plain });
      plain = "";
    }
  };
  while (i < src.length) {
    const rest = src.slice(i);
    let matched = false;
    // Only attempt markup at plausible starts to keep this fast on long lines.
    if ("`!*_~[".includes(src[i])) {
      for (const rule of INLINE_RULES) {
        const m = rule.re.exec(rest);
        if (m) {
          flush();
          out.push(rule.make(m));
          i += m[0].length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      plain += src[i];
      i++;
    }
  }
  flush();
  return out;
}

// ── Block parsing ─────────────────────────────────────────────────────

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s{0,3}```\s*(\S*)\s*$/;
const UL_ITEM = /^\s{0,3}[-*+]\s+(.*)$/;
const OL_ITEM = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    let m = FENCE.exec(line);
    if (m) {
      const lang = m[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.exec(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence (or run off the end)
      blocks.push({ t: "codeblock", lang, code: code.join("\n") });
      continue;
    }

    m = HEADING.exec(line);
    if (m) {
      blocks.push({ t: "heading", level: m[1].length, children: parseInline(m[2].trim()) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }

    m = QUOTE.exec(line);
    if (m) {
      const inner: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]);
        if (!q) break;
        inner.push(q[1]);
        i++;
      }
      blocks.push({ t: "quote", children: parseMarkdown(inner.join("\n")) });
      continue;
    }

    m = UL_ITEM.exec(line);
    if (m) {
      const items: Inline[][] = [];
      while (i < lines.length) {
        const it = UL_ITEM.exec(lines[i]);
        if (!it) break;
        items.push(parseInline(it[1]));
        i++;
      }
      blocks.push({ t: "list", ordered: false, start: 1, items });
      continue;
    }

    m = OL_ITEM.exec(line);
    if (m) {
      const start = Number(m[1]);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const it = OL_ITEM.exec(lines[i]);
        if (!it) break;
        items.push(parseInline(it[2]));
        i++;
      }
      blocks.push({ t: "list", ordered: true, start, items });
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !UL_ITEM.test(lines[i]) &&
      !OL_ITEM.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ t: "para", children: parseInline(para.join(" ")) });
  }

  return blocks;
}

// ── Safety helpers ────────────────────────────────────────────────────

/** Blocks javascript:/data:/vbscript: URLs; everything else passes through. */
export function safeHref(href: string): string {
  return /^\s*(javascript|data|vbscript):/i.test(href) ? "#" : href;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── React renderer (preview) ──────────────────────────────────────────

function renderInline(nodes: Inline[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.t) {
      case "text":
        return node.text;
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
            {node.text}
          </code>
        );
      case "strong":
        return <strong key={i}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(node.children)}</em>;
      case "del":
        return <del key={i}>{renderInline(node.children)}</del>;
      case "link":
        return (
          <a
            key={i}
            href={safeHref(node.href)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {renderInline(node.children)}
          </a>
        );
      case "img":
        // Images render as a labeled link, never a network fetch.
        return (
          <a
            key={i}
            href={safeHref(node.src)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {node.alt || "image"}
          </a>
        );
    }
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-5 mb-2 text-xl font-bold first:mt-0",
  2: "mt-5 mb-2 text-lg font-bold first:mt-0",
  3: "mt-4 mb-1.5 text-base font-semibold first:mt-0",
  4: "mt-4 mb-1.5 text-sm font-semibold first:mt-0",
  5: "mt-3 mb-1 text-sm font-semibold first:mt-0",
  6: "mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0",
};

export function renderBlocks(blocks: Block[]): React.ReactNode[] {
  return blocks.map((block, i) => {
    switch (block.t) {
      case "heading": {
        const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        return (
          <Tag key={i} className={HEADING_CLASS[block.level]}>
            {renderInline(block.children)}
          </Tag>
        );
      }
      case "para":
        return (
          <p key={i} className="my-2 leading-relaxed first:mt-0">
            {renderInline(block.children)}
          </p>
        );
      case "codeblock":
        return (
          <pre
            key={i}
            className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
          >
            <code>{block.code}</code>
          </pre>
        );
      case "quote":
        return (
          <blockquote
            key={i}
            className="my-3 border-l-2 border-accent pl-3 text-muted-foreground"
          >
            {renderBlocks(block.children)}
          </blockquote>
        );
      case "list":
        return block.ordered ? (
          <ol key={i} start={block.start} className="my-2 list-decimal space-y-1 pl-6">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="my-2 list-disc space-y-1 pl-6">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      case "hr":
        return <hr key={i} className="my-4 border-border" />;
    }
  });
}

// ── HTML serializer (Copy HTML / download) ────────────────────────────

function inlineToHtml(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.t) {
        case "text":
          return escapeHtml(node.text);
        case "code":
          return `<code>${escapeHtml(node.text)}</code>`;
        case "strong":
          return `<strong>${inlineToHtml(node.children)}</strong>`;
        case "em":
          return `<em>${inlineToHtml(node.children)}</em>`;
        case "del":
          return `<del>${inlineToHtml(node.children)}</del>`;
        case "link":
          return `<a href="${escapeHtml(safeHref(node.href))}">${inlineToHtml(node.children)}</a>`;
        case "img":
          return `<img src="${escapeHtml(safeHref(node.src))}" alt="${escapeHtml(node.alt)}">`;
      }
    })
    .join("");
}

export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.t) {
        case "heading":
          return `<h${block.level}>${inlineToHtml(block.children)}</h${block.level}>`;
        case "para":
          return `<p>${inlineToHtml(block.children)}</p>`;
        case "codeblock": {
          const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
          return `<pre><code${cls}>${escapeHtml(block.code)}</code></pre>`;
        }
        case "quote":
          return `<blockquote>\n${blocksToHtml(block.children)}\n</blockquote>`;
        case "list": {
          const items = block.items.map((it) => `  <li>${inlineToHtml(it)}</li>`).join("\n");
          return block.ordered
            ? `<ol${block.start !== 1 ? ` start="${block.start}"` : ""}>\n${items}\n</ol>`
            : `<ul>\n${items}\n</ul>`;
        }
        case "hr":
          return "<hr>";
      }
    })
    .join("\n");
}

export function markdownToHtml(src: string): string {
  return blocksToHtml(parseMarkdown(src));
}

export function markdownToDocument(src: string, title = "Markdown export"): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 46rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.6; color: #1a1a1a; }
  pre { background: #f4f4f4; padding: 0.75rem; border-radius: 6px; overflow-x: auto; }
  code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1rem; color: #555; }
</style>
</head>
<body>
${markdownToHtml(src)}
</body>
</html>
`;
}
