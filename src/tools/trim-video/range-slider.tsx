import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "./time";

/** Minimum clip length in seconds so the handles never cross. */
const MIN_GAP = 0.1;

type Handle = "start" | "end";

/**
 * Dual-handle trim slider. A single track div with two draggable handles
 * (pointer events) and the selected span filled with the accent color.
 */
export function RangeSlider({
  max,
  start,
  end,
  onChange,
  disabled = false,
  className,
}: {
  /** Track length in seconds (video duration). */
  max: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<Handle | null>(null);

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || max <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * max;
    },
    [max],
  );

  const moveHandle = useCallback(
    (handle: Handle, value: number) => {
      if (handle === "start") {
        onChange(clamp(value, 0, Math.max(0, end - MIN_GAP)), end);
      } else {
        onChange(start, clamp(value, Math.min(max, start + MIN_GAP), max));
      }
    },
    [start, end, max, onChange],
  );

  const onHandlePointerDown = useCallback(
    (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = handle;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const handle = draggingRef.current;
      if (!handle || disabled) return;
      moveHandle(handle, valueFromClientX(e.clientX));
    },
    [disabled, moveHandle, valueFromClientX],
  );

  const onHandlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [],
  );

  // Clicking the bare track jumps the nearest handle to that spot.
  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const value = valueFromClientX(e.clientX);
      const nearest: Handle =
        Math.abs(value - start) <= Math.abs(value - end) ? "start" : "end";
      moveHandle(nearest, value);
    },
    [disabled, valueFromClientX, start, end, moveHandle],
  );

  const onHandleKeyDown = useCallback(
    (handle: Handle) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const step = e.shiftKey ? 1 : 0.1;
      const current = handle === "start" ? start : end;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        moveHandle(handle, current - step);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        moveHandle(handle, current + step);
      }
    },
    [disabled, start, end, moveHandle],
  );

  const startPct = max > 0 ? (start / max) * 100 : 0;
  const endPct = max > 0 ? (end / max) * 100 : 100;

  const handleClass = cn(
    "absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full",
    "border-2 border-accent bg-card shadow-sm",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    disabled ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
  );

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      className={cn(
        "relative h-2 w-full touch-none rounded-full bg-muted",
        disabled ? "opacity-60" : "cursor-pointer",
        className,
      )}
    >
      {/* Selected span */}
      <div
        className="absolute inset-y-0 rounded-full bg-accent"
        style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
      />
      {/* Start handle */}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Clip start"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={start}
        aria-disabled={disabled}
        onPointerDown={onHandlePointerDown("start")}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onKeyDown={onHandleKeyDown("start")}
        className={handleClass}
        style={{ left: `${startPct}%` }}
      />
      {/* End handle */}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Clip end"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={end}
        aria-disabled={disabled}
        onPointerDown={onHandlePointerDown("end")}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onKeyDown={onHandleKeyDown("end")}
        className={handleClass}
        style={{ left: `${endPct}%` }}
      />
    </div>
  );
}
