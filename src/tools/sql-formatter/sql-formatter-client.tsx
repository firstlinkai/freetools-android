import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Database, Download } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadText } from "@/lib/download";
import { formatSql, minifySql } from "./sql-format";

const SAMPLE = `select u.id, u.name, count(o.id) as order_count, sum(o.total) as lifetime_value
from users u left join orders o on o.user_id = u.id
where u.active = 1 and u.created_at >= '2024-01-01' and u.id in (select user_id from subscriptions where status = 'active')
group by u.id, u.name having count(o.id) > 0 order by lifetime_value desc limit 25;`;

export function SqlFormatterClient() {
  const [input, setInput] = useState("");
  const [minify, setMinify] = useState(false);

  const output = useMemo(() => {
    if (!input.trim()) return "";
    return minify ? minifySql(input) : formatSql(input);
  }, [input, minify]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={minify}
            onChange={(e) => setMinify(e.target.checked)}
          />
          Minify (single line, comments removed)
        </label>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setInput(SAMPLE)}>
          <Database className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="SQL input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={"Paste a query, e.g.\nselect id, name from users where active = 1 order by name"}
            className="min-h-[18rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="SQL input"
          />
        </Panel>

        <Panel
          title={minify ? "Minified" : "Formatted"}
          actions={
            <>
              <CopyButton text={output} />
              <Button
                variant="secondary"
                size="sm"
                disabled={!output}
                onClick={() => downloadText(output, "query.sql", "application/sql")}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          {!input.trim() ? (
            <p className="p-2 text-sm text-muted-foreground">
              Paste SQL on the left. Keywords are uppercased, each major clause starts its own line,
              and subqueries are indented — or flip the Minify toggle for a compact single line.
              String literals and comments are preserved untouched.
            </p>
          ) : (
            <pre className="max-h-[24rem] overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
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
    <ToolPage slug="sql-formatter">
      <SqlFormatterClient />
    </ToolPage>
  );
}
