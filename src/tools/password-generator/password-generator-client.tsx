import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/~";
const AMBIGUOUS = new Set("0O1lI|");

const ALTERNATE_COUNT = 5;

/**
 * Unbiased random indices in [0, max) from crypto.getRandomValues.
 * Values above the largest multiple of `max` are rejected and redrawn,
 * so there is no modulo bias.
 */
function randomIndices(count: number, max: number): number[] {
  const out: number[] = [];
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(Math.max(count, 64));
  while (out.length < count) {
    crypto.getRandomValues(buf);
    for (const v of buf) {
      if (v < limit) {
        out.push(v % max);
        if (out.length === count) break;
      }
    }
  }
  return out;
}

function generatePassword(charset: string, length: number): string {
  return randomIndices(length, charset.length)
    .map((i) => charset[i])
    .join("");
}

interface Strength {
  bits: number;
  label: string;
  pct: number;
  barClass: string;
}

function strengthOf(charsetSize: number, length: number): Strength {
  const bits = charsetSize > 1 ? Math.round(length * Math.log2(charsetSize)) : 0;
  if (bits < 50) return { bits, label: "Weak", pct: 25, barClass: "bg-danger" };
  if (bits < 80) return { bits, label: "Fair", pct: 50, barClass: "bg-danger/60" };
  if (bits < 110) return { bits, label: "Strong", pct: 75, barClass: "bg-accent" };
  return { bits, label: "Excellent", pct: 100, barClass: "bg-accent" };
}

export function PasswordGeneratorClient() {
  const [length, setLength] = useState(20);
  const [useLower, setUseLower] = useState(true);
  const [useUpper, setUseUpper] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [password, setPassword] = useState("");
  const [alternates, setAlternates] = useState<string[]>([]);

  const charset = useMemo(() => {
    let chars = "";
    if (useLower) chars += LOWER;
    if (useUpper) chars += UPPER;
    if (useDigits) chars += DIGITS;
    if (useSymbols) chars += SYMBOLS;
    if (excludeAmbiguous) chars = [...chars].filter((c) => !AMBIGUOUS.has(c)).join("");
    return chars;
  }, [useLower, useUpper, useDigits, useSymbols, excludeAmbiguous]);

  const regenerate = useCallback(() => {
    if (charset.length === 0) {
      setPassword("");
      setAlternates([]);
      return;
    }
    setPassword(generatePassword(charset, length));
    setAlternates(
      Array.from({ length: ALTERNATE_COUNT }, () => generatePassword(charset, length)),
    );
  }, [charset, length]);

  // New batch on load and whenever an option changes.
  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const strength = strengthOf(charset.length, length);

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
      <Panel
        title="Password"
        actions={
          <>
            <CopyButton text={password} disabled={!password} />
          </>
        }
      >
        {charset.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Turn on at least one character set below to generate a password.
          </p>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={regenerate}
              title="Tap to regenerate"
              className={cn(
                "block w-full break-all rounded-md bg-muted p-4 text-left font-mono text-base leading-relaxed text-foreground transition-colors hover:bg-border/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {password}
            </button>
            <div className="flex items-center justify-between gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", strength.barClass)}
                  style={{ width: `${strength.pct}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {strength.label} · ~{strength.bits} bits
              </span>
            </div>
            <button
              type="button"
              onClick={regenerate}
              className={cn(
                "flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Options">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="pw-length">Length</Label>
              <span className="font-mono text-sm text-foreground">{length}</span>
            </div>
            <Slider
              id="pw-length"
              min={8}
              max={64}
              step={1}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              aria-label="Password length"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {checkbox("Lowercase (a-z)", useLower, setUseLower)}
            {checkbox("Uppercase (A-Z)", useUpper, setUseUpper)}
            {checkbox("Digits (0-9)", useDigits, setUseDigits)}
            {checkbox("Symbols (!@#$…)", useSymbols, setUseSymbols)}
            {checkbox("Exclude ambiguous (0O1lI|)", excludeAmbiguous, setExcludeAmbiguous)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Generated with crypto.getRandomValues and rejection sampling, entirely on this device.
          </p>
        </div>
      </Panel>

      <Panel title="Alternates">
        {alternates.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Five extra candidates appear here with each generation.
          </p>
        ) : (
          <ul className="space-y-2">
            {alternates.map((alt, i) => (
              <li
                key={`${i}-${alt}`}
                className="flex items-center gap-2 rounded-md border border-border bg-muted p-2"
              >
                <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-foreground">
                  {alt}
                </code>
                <CopyButton text={alt} variant="ghost" label="Copy" />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="password-generator">
      <PasswordGeneratorClient />
    </ToolPage>
  );
}
