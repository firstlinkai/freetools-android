import { Component, Suspense, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getTool } from "@/lib/tools-registry";
import { TOOL_COMPONENTS } from "@/tools";

class ToolErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium">This tool hit an unexpected error.</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-12 items-center rounded-lg bg-accent px-6 text-sm font-semibold text-accent-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ToolScreen() {
  const { slug = "" } = useParams();
  const tool = getTool(slug);
  const Tool = TOOL_COMPONENTS[slug];

  if (!tool || !Tool) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm">Unknown tool.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl">
      <header className="safe-top sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
        <Link
          to="/"
          aria-label="Back to dashboard"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg active:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <span className="truncate text-sm font-semibold">{tool.name}</span>
      </header>
      <main className="safe-bottom">
        <ToolErrorBoundary>
          <Suspense
            fallback={
              <p className="py-12 text-center text-sm text-muted-foreground">
                Loading tool…
              </p>
            }
          >
            <Tool />
          </Suspense>
        </ToolErrorBoundary>
      </main>
    </div>
  );
}
