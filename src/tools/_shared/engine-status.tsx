
import { Loader2, Zap } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EngineState } from "./use-ffmpeg";

/** Shared FFmpeg engine status panel for the multi-input video tools. */
export function EngineStatus({
  state,
  loadPercent,
  onRetry,
}: {
  state: EngineState;
  loadPercent: number;
  onRetry: () => void;
}) {
  return (
    <Panel bodyClassName="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-4 w-4 text-accent" aria-hidden />
        <span className="text-sm font-medium text-foreground">Video engine</span>
        {state === "ready" && <Badge>Ready</Badge>}
        {state === "loading" && (
          <Badge>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Downloading {loadPercent}%
          </Badge>
        )}
        {state === "error" && <span className="text-xs text-danger">Failed to load</span>}
      </div>
      {state === "loading" && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${loadPercent}%` }} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The engine (~31 MB) downloads once and is cached by your browser. Your
        files never leave this device.
      </p>
      {state === "error" && (
        <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
          Retry download
        </Button>
      )}
    </Panel>
  );
}
