import { useEffect, useMemo, useState } from "react";
import { ToolPage } from "@/components/tool/tool-page";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Epoch ⇄ human date conversion. Second vs millisecond timestamps are
 * auto-detected by magnitude (13+ digits ⇒ ms). Everything is computed with
 * the built-in Date — fully offline.
 */
function detectMillis(n: number): boolean {
  return Math.abs(n) >= 1e12;
}

function relativeTime(date: Date): string {
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [1000, "second"],
    [60_000, "minute"],
    [3_600_000, "hour"],
    [86_400_000, "day"],
    [31_557_600_000, "year"],
  ];
  let best: [number, string] = units[0];
  for (const u of units) if (abs >= u[0]) best = u;
  const count = Math.round(abs / best[0]);
  const label = `${count} ${best[1]}${count === 1 ? "" : "s"}`;
  return diff < 0 ? `${label} ago` : `in ${label}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-all text-sm">{value}</p>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

/** Formats a Date for a datetime-local input, in local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function UnixTimeClient() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [epochRaw, setEpochRaw] = useState("");
  const [dateRaw, setDateRaw] = useState(() => toLocalInputValue(new Date()));

  type EpochResult = { error: string } | { date: Date; unit: string };
  const epochResult = useMemo<EpochResult | null>(() => {
    const trimmed = epochRaw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { error: "Enter a numeric timestamp." };
    const ms = detectMillis(n) ? n : n * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { error: "Timestamp out of range." };
    return { date: d, unit: detectMillis(n) ? "milliseconds" : "seconds" };
  }, [epochRaw]);

  const dateResult = useMemo(() => {
    if (!dateRaw) return null;
    const d = new Date(dateRaw);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [dateRaw]);

  return (
    <div className="space-y-4">
      <Panel title="Current time">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-accent">
              {Math.floor(now / 1000)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(now).toLocaleString()} · live epoch seconds
            </p>
          </div>
          <CopyButton text={String(Math.floor(now / 1000))} />
        </div>
      </Panel>

      <Panel title="Timestamp → date">
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="epoch-in">Epoch (seconds or milliseconds)</Label>
              <Input
                id="epoch-in"
                inputMode="numeric"
                placeholder="e.g. 1789000000"
                value={epochRaw}
                onChange={(e) => setEpochRaw(e.target.value)}
                className="mt-1 h-12"
              />
            </div>
            <Button
              type="button"
              className="h-12 shrink-0"
              onClick={() => setEpochRaw(String(Math.floor(Date.now() / 1000)))}
            >
              Now
            </Button>
          </div>
          {epochResult && "error" in epochResult && (
            <p className="text-xs text-danger">{epochResult.error}</p>
          )}
          {epochResult && "date" in epochResult && (
            <div className="rounded-lg border border-border bg-card px-4 py-1">
              <Row label="Local time" value={epochResult.date.toLocaleString()} />
              <Row label="UTC" value={epochResult.date.toUTCString()} />
              <Row label="ISO 8601" value={epochResult.date.toISOString()} />
              <div className="flex min-h-10 items-center justify-between py-2">
                <p className="text-xs text-muted-foreground">
                  Interpreted as {epochResult.unit} · {relativeTime(epochResult.date)}
                </p>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Date → timestamp">
        <div className="space-y-2">
          <Label htmlFor="date-in">Local date &amp; time</Label>
          <input
            id="date-in"
            type="datetime-local"
            step="1"
            value={dateRaw}
            onChange={(e) => setDateRaw(e.target.value)}
            className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/40"
          />
          {dateResult && (
            <div className="rounded-lg border border-border bg-card px-4 py-1">
              <Row label="Epoch seconds" value={String(Math.floor(dateResult.getTime() / 1000))} />
              <Row label="Epoch milliseconds" value={String(dateResult.getTime())} />
              <Row label="ISO 8601 (UTC)" value={dateResult.toISOString()} />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="unix-time-converter">
      <UnixTimeClient />
    </ToolPage>
  );
}
