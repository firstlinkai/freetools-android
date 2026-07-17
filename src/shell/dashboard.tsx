import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { TOOLS, TOOL_CATEGORIES, type ToolDef } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";

/** Live keyword filter across name, description, category, and keywords. */
function matches(tool: ToolDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every(
    (part) =>
      tool.name.toLowerCase().includes(part) ||
      tool.slug.includes(part) ||
      tool.category.toLowerCase().includes(part) ||
      tool.description.toLowerCase().includes(part) ||
      tool.keywords.some((k) => k.includes(part)),
  );
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  return (
    <Link
      to={`/tools/${tool.slug}`}
      // 48dp minimum touch target per PRD; whole card is tappable.
      className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 active:border-accent active:bg-muted"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4.5 w-4.5 text-accent" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{tool.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

function CategoryDrawer({ category, tools }: { category: string; tools: ToolDef[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between rounded-lg px-1 text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {category}
          <span className="ml-2 font-normal text-muted-foreground/60">{tools.length}</span>
        </h2>
        <ChevronDown
          className={cn("h-5 w-5 text-muted-foreground transition-transform", !open && "-rotate-90")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-1 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {tools.map((t) => (
            <ToolCard key={t.slug} tool={t} />
          ))}
        </div>
      )}
    </section>
  );
}

export function Dashboard() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => TOOLS.filter((t) => matches(t, query)), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl">
      <header className="safe-top sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mb-3 flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-tight">
            Free<span className="text-accent">Tools</span>
          </h1>
          <span className="text-xs text-muted-foreground">
            {TOOLS.length} offline tools · nothing leaves your phone
          </span>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Search tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 w-full rounded-lg border border-border bg-card pl-10 pr-10 text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/40"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-muted-foreground"
            >
              <X className="h-4.5 w-4.5" aria-hidden />
            </button>
          )}
        </div>
      </header>

      <main className="safe-bottom px-4 py-4">
        {searching ? (
          filtered.length ? (
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {filtered.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tools match “{query.trim()}”.
            </p>
          )
        ) : (
          TOOL_CATEGORIES.map((cat) => {
            const tools = TOOLS.filter((t) => t.category === cat);
            return tools.length ? (
              <CategoryDrawer key={cat} category={cat} tools={tools} />
            ) : null;
          })
        )}
      </main>
    </div>
  );
}
