import { cn } from "@/lib/utils";

/**
 * Labeled workspace block. Tools compose these into input/output splits.
 */
export function Panel({
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          {title && (
            <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
          )}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn("min-h-0 flex-1 p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
