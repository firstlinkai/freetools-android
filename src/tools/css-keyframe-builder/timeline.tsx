
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { sortStops, type Stop } from "./keyframes";

const isEndpoint = (stop: Stop) => stop.percent === 0 || stop.percent === 100;

/**
 * Horizontal keyframe track. Click empty track to add a stop, click a dot to
 * select it, drag a middle dot to change its percent (endpoints stay fixed).
 */
export function Timeline({
  stops,
  selectedId,
  onSelect,
  onAdd,
  onMove,
}: {
  stops: Stop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (percent: number) => void;
  onMove: (id: string, percent: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<string | null>(null);

  const percentFromClientX = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 50;
    const rect = track.getBoundingClientRect();
    const raw = ((clientX - rect.left) / rect.width) * 100;
    return Math.round(Math.min(100, Math.max(0, raw)));
  };

  return (
    <div className="space-y-1.5">
      <div
        ref={trackRef}
        className="relative h-12 w-full cursor-copy rounded-md bg-muted"
        onPointerDown={(e) => {
          // Only empty-track clicks add a stop; dot clicks are handled below.
          if (e.target !== e.currentTarget) return;
          const percent = Math.min(99, Math.max(1, percentFromClientX(e.clientX)));
          onAdd(percent);
        }}
      >
        {/* center guide line */}
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {sortStops(stops).map((stop) => {
          const endpoint = isEndpoint(stop);
          const selected = stop.id === selectedId;
          return (
            <button
              key={stop.id}
              type="button"
              aria-label={`Keyframe at ${stop.percent}%`}
              className={cn(
                "absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-shadow",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                endpoint ? "cursor-pointer" : "cursor-ew-resize",
                selected
                  ? "border-accent bg-accent ring-2 ring-accent/40 ring-offset-2 ring-offset-card"
                  : "border-muted-foreground/60 bg-card hover:border-accent",
              )}
              style={{ left: `${stop.percent}%` }}
              onPointerDown={(e) => {
                onSelect(stop.id);
                if (endpoint) return;
                draggingId.current = stop.id;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (draggingId.current !== stop.id) return;
                const percent = Math.min(99, Math.max(1, percentFromClientX(e.clientX)));
                onMove(stop.id, percent);
              }}
              onPointerUp={() => {
                draggingId.current = null;
              }}
              onPointerCancel={() => {
                draggingId.current = null;
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
