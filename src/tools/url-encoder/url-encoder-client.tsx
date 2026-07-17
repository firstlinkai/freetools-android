import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { ArrowDownUp, Link2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Direction = "encode" | "decode";
type UrlMode = "component" | "full";

const SAMPLE_COMPONENT = "search terms with spaces & symbols = 100% (café)";
const SAMPLE_FULL = "https://www.example.com/path with spaces/?q=coffee & cream#top";

const MODES: { id: UrlMode; label: string; hint: string }[] = [
  {
    id: "component",
    label: "Component",
    hint: "encodeURIComponent — escapes everything unsafe, for query values and path segments",
  },
  {
    id: "full",
    label: "Full URL",
    hint: "encodeURI — keeps :/?#&= intact so a whole URL stays clickable",
  },
];

export function UrlEncoderClient() {
  const [direction, setDirection] = useState<Direction>("encode");
  const [mode, setMode] = useState<UrlMode>("component");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { output: "", error: null as string | null };
    try {
      const output =
        direction === "encode"
          ? mode === "component"
            ? encodeURIComponent(input)
            : encodeURI(input)
          : mode === "component"
            ? decodeURIComponent(input)
            : decodeURI(input);
      return { output, error: null };
    } catch (e) {
      return { output: "", error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, direction, mode]);

  const swap = () => {
    setDirection((d) => (d === "encode" ? "decode" : "encode"));
    if (result.output && !result.error) setInput(result.output);
  };

  const activeMode = MODES.find((m) => m.id === mode)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              title={m.hint}
              className={cn(
                "h-9 rounded-md px-4 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === m.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={swap}>
          <ArrowDownUp className="h-3.5 w-3.5" />
          {direction === "encode" ? "Encoding — switch to decode" : "Decoding — switch to encode"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setInput(mode === "component" ? SAMPLE_COMPONENT : SAMPLE_FULL)}
        >
          <Link2 className="h-3.5 w-3.5" />
          Load sample
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{activeMode.hint}.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={direction === "encode" ? "Plain input" : "Encoded input"}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={
              direction === "encode"
                ? mode === "component"
                  ? "Text to escape, e.g. a query value with spaces & symbols"
                  : "A full URL to make safe, e.g. https://www.example.com/some path"
                : "Percent-encoded text to decode, e.g. caf%C3%A9%20%26%20cream"
            }
            className="min-h-[14rem] resize-y font-mono text-xs leading-relaxed"
            aria-label="URL input"
          />
        </Panel>

        <Panel
          title={direction === "encode" ? "Encoded output" : "Decoded output"}
          actions={<CopyButton text={result.output} />}
        >
          {!input ? (
            <p className="p-2 text-sm text-muted-foreground">
              The result updates live as you type. Component mode escapes individual values; Full URL
              mode keeps URL structure characters intact.
            </p>
          ) : result.error ? (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">Cannot decode</p>
              <p className="mt-1 font-mono text-xs">{result.error}</p>
              <p className="mt-1 text-xs">
                Check for stray % signs — every % must be followed by two hex digits.
              </p>
            </div>
          ) : (
            <pre className="max-h-[18rem] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {result.output}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="url-encoder">
      <UrlEncoderClient />
    </ToolPage>
  );
}
