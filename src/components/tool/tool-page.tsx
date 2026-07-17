import { getTool } from "@/lib/tools-registry";
import { Badge } from "@/components/ui/badge";

/**
 * Lean chrome inside every tool screen: icon, name, subtitle, category, then
 * the tool itself. (The web version's long-form SEO content sections are
 * intentionally not ported — app screens stay focused on the tool.)
 */
export function ToolPage({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const tool = getTool(slug);
  if (!tool) throw new Error(`Tool not in registry: ${slug}`);
  const Icon = tool.icon;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
          <Icon className="h-5 w-5 text-accent" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{tool.name}</h1>
            <Badge>{tool.category}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{tool.description}</p>
        </div>
      </header>
      {children}
    </div>
  );
}
