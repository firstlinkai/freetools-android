import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadText } from "@/lib/download";

const MIN_COUNT = 1;
const MAX_COUNT = 100;

/** RFC 4122 v4 UUID; falls back to getRandomValues bit-twiddling off-HTTPS. */
function uuidV4(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function clampCount(n: number): number {
  if (Number.isNaN(n)) return MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.floor(n)));
}

export function UuidGeneratorClient() {
  const [count, setCount] = useState(5);
  const [countInput, setCountInput] = useState("5");
  const [uppercase, setUppercase] = useState(false);
  const [noHyphens, setNoHyphens] = useState(false);
  const [uuids, setUuids] = useState<string[]>(() =>
    Array.from({ length: 5 }, () => uuidV4()),
  );

  const display = useMemo(
    () =>
      uuids.map((u) => {
        let out = u;
        if (noHyphens) out = out.replaceAll("-", "");
        if (uppercase) out = out.toUpperCase();
        return out;
      }),
    [uuids, uppercase, noHyphens],
  );

  const allText = useMemo(() => display.join("\n"), [display]);

  const generate = () => {
    setUuids(Array.from({ length: count }, () => uuidV4()));
  };

  const onCountChange = (raw: string) => {
    setCountInput(raw);
    if (raw.trim() !== "") setCount(clampCount(Number(raw)));
  };

  const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 text-sm text-foreground">
      <input
        type="checkbox"
        className="h-4 w-4 accent-accent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <Panel title="Options">
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="uuid-count">How many (1-100)</Label>
              <Input
                id="uuid-count"
                type="number"
                inputMode="numeric"
                min={MIN_COUNT}
                max={MAX_COUNT}
                value={countInput}
                onChange={(e) => onCountChange(e.target.value)}
                onBlur={() => setCountInput(String(count))}
                className="w-32"
              />
            </div>
            <Button className="h-12 flex-1" onClick={generate}>
              <RefreshCw className="h-4 w-4" />
              Generate
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {checkbox("Uppercase", uppercase, setUppercase)}
            {checkbox("Remove hyphens", noHyphens, setNoHyphens)}
          </div>
        </div>
      </Panel>

      <Panel
        title={`UUIDs (${display.length})`}
        actions={
          <>
            <CopyButton text={allText} label="Copy all" disabled={!allText} />
            <Button
              variant="secondary"
              size="sm"
              disabled={!allText}
              onClick={() => downloadText(allText + "\n", "uuids.txt")}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </>
        }
      >
        {display.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Tap Generate to create version-4 UUIDs.
          </p>
        ) : (
          <ul className="space-y-2">
            {display.map((u, i) => (
              <li
                key={`${i}-${u}`}
                className="flex items-center gap-2 rounded-md border border-border bg-muted p-2"
              >
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-foreground">
                  {u}
                </code>
                <CopyButton text={u} variant="ghost" label="Copy" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-[11px] text-muted-foreground">
        Version-4 UUIDs are 122 bits of secure randomness from this device — collisions are
        practically impossible. Nothing is sent anywhere.
      </p>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="uuid-generator">
      <UuidGeneratorClient />
    </ToolPage>
  );
}
