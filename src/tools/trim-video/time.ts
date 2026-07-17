/** Formats seconds as "mm:ss.t" (tenths of a second). */
export function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = (Math.floor(rest * 10) / 10).toFixed(1).padStart(4, "0");
  return `${mm}:${ss}`;
}

/**
 * Parses "mm:ss.t", "m:ss", "h:mm:ss", or plain seconds ("42", "42.5")
 * into seconds. Returns null for anything unparseable.
 */
export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;

  let seconds = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part.trim())) return null;
    seconds = seconds * 60 + parseFloat(part.trim());
  }
  return Number.isFinite(seconds) ? seconds : null;
}

/** Clamps a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
