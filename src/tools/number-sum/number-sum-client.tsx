import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EXAMPLE = `Expense log, March
Coffee w/ client $4.50, then $3.25 tip
Office supplies: 1,250 total (paper 320, ink 930)
Refund received: -45.99 from vendor
Taxi 12.80 + 14.20 back
Lunch meeting 38.75 USD
Software subscription $29
Adjustment: -3.5 credit
Misc snacks 6.40, 2.15, 0.99`;

const DISPLAY_CAP = 500;

function extractNumbers(
  text: string,
  commasAsThousands: boolean,
  includeNegatives: boolean,
): number[] {
  if (!text) return [];
  let source = text;
  if (commasAsThousands) {
    // Strip commas that sit between digits so "1,250" becomes "1250".
    source = source.replace(/(\d),(?=\d)/g, "$1");
  }
  const pattern = includeNegatives ? /-?\d+(?:\.\d+)?/g : /\d+(?:\.\d+)?/g;
  const matches = source.match(pattern) ?? [];
  return matches
    .map((m) => Number.parseFloat(m))
    .filter((n) => Number.isFinite(n));
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function NumberSumClient() {
  const [text, setText] = useState("");
  const [commasAsThousands, setCommasAsThousands] = useState(true);
  const [includeNegatives, setIncludeNegatives] = useState(true);

  const numbers = useMemo(
    () => extractNumbers(text, commasAsThousands, includeNegatives),
    [text, commasAsThousands, includeNegatives],
  );

  const stats = useMemo(() => {
    if (numbers.length === 0) return null;
    const sum = numbers.reduce((a, b) => a + b, 0);
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return {
      count: numbers.length,
      sum,
      average: sum / numbers.length,
      median,
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }, [numbers]);

  const tiles: Array<{ label: string; value: string }> = [
    { label: "Count", value: stats ? formatNumber(stats.count) : "0" },
    { label: "Sum", value: stats ? formatNumber(stats.sum) : "0" },
    { label: "Average", value: stats ? formatNumber(stats.average) : "0" },
    { label: "Median", value: stats ? formatNumber(stats.median) : "0" },
    { label: "Min", value: stats ? formatNumber(stats.min) : "0" },
    { label: "Max", value: stats ? formatNumber(stats.max) : "0" },
  ];

  const numbersCsv = () => numbers.map((n) => String(n)).join(", ");
  const statsSummary = () => {
    if (!stats) return "";
    return [
      `Count: ${formatNumber(stats.count)}`,
      `Sum: ${formatNumber(stats.sum)}`,
      `Average: ${formatNumber(stats.average)}`,
      `Median: ${formatNumber(stats.median)}`,
      `Min: ${formatNumber(stats.min)}`,
      `Max: ${formatNumber(stats.max)}`,
    ].join("\n");
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Input text"
        actions={
          <Button variant="secondary" size="sm" onClick={() => setText(EXAMPLE)}>
            <FileText className="h-3.5 w-3.5" />
            Load example
          </Button>
        }
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste anything: expense logs, reports, chat messages. Every number gets extracted."
          className="min-h-[180px] font-mono text-xs leading-relaxed sm:text-sm"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={commasAsThousands}
              onChange={(e) => setCommasAsThousands(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
            Treat commas as thousands separators (1,250 = 1250)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeNegatives}
              onChange={(e) => setIncludeNegatives(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
            Include negative numbers
          </label>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-border bg-card px-3 py-4 text-center"
          >
            <p
              className={cn(
                "truncate font-mono text-xl font-semibold tabular-nums",
                stats ? "text-foreground" : "text-muted-foreground",
              )}
              title={tile.value}
            >
              {tile.value}
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </p>
          </div>
        ))}
      </div>
      {!stats && (
        <p className="-mt-1 text-center text-xs text-muted-foreground">
          Paste text above or load the example to see live statistics.
        </p>
      )}

      <Panel
        title="Extracted numbers"
        actions={
          <>
            <CopyButton text={numbersCsv} label="Copy list" disabled={numbers.length === 0} />
            <CopyButton text={statsSummary} label="Copy stats" disabled={numbers.length === 0} />
          </>
        }
      >
        {numbers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No numbers found yet. Decimals, thousands-separated values, and negatives are all supported.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {numbers.slice(0, DISPLAY_CAP).map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs tabular-nums"
                >
                  {formatNumber(n)}
                </span>
              ))}
            </div>
            {numbers.length > DISPLAY_CAP && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing the first {DISPLAY_CAP} of {formatNumber(numbers.length)} numbers. Copy the list to get all of them.
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="number-sum">
      <NumberSumClient />
    </ToolPage>
  );
}
