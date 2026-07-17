import { ToolPage } from "@/components/tool/tool-page";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Dices, Download } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { downloadText } from "@/lib/download";
import { cn } from "@/lib/utils";
import { buildBlobSvg, buildWaveSvg } from "./generate";

type Mode = "wave" | "blob";

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">
          {display ?? value}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-none"
      />
      <div className="min-w-0">
        <Label className="block">{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

export function WaveClient() {
  const [mode, setMode] = useState<Mode>("wave");
  // Fixed initial seed so server and client render identical output.
  const [seed, setSeed] = useState(() => 1234);

  // Wave controls
  const [complexity, setComplexity] = useState(4);
  const [waveVariance, setWaveVariance] = useState(55);
  const [height, setHeight] = useState(50);
  const [layers, setLayers] = useState(3);
  const [waveColor, setWaveColor] = useState("#6366f1");
  const [opacity, setOpacity] = useState(1);
  const [flip, setFlip] = useState(false);

  // Blob controls
  const [points, setPoints] = useState(7);
  const [blobVariance, setBlobVariance] = useState(45);
  const [blobColor, setBlobColor] = useState("#6366f1");
  const [gradient, setGradient] = useState(false);
  const [blobColor2, setBlobColor2] = useState("#06b6d4");

  const [showCode, setShowCode] = useState(false);

  const svg = useMemo(() => {
    if (mode === "wave") {
      return buildWaveSvg({
        seed,
        complexity,
        variance: waveVariance,
        height,
        layers,
        color: waveColor,
        opacity,
        flip,
      });
    }
    return buildBlobSvg({
      seed,
      points,
      variance: blobVariance,
      color: blobColor,
      gradient,
      color2: blobColor2,
    });
  }, [
    mode,
    seed,
    complexity,
    waveVariance,
    height,
    layers,
    waveColor,
    opacity,
    flip,
    points,
    blobVariance,
    blobColor,
    gradient,
    blobColor2,
  ]);

  const randomize = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  };

  const download = () => {
    downloadText(svg, mode === "wave" ? "wave.svg" : "blob.svg", "image/svg+xml");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="Controls" bodyClassName="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          <Button
            size="sm"
            variant={mode === "wave" ? "primary" : "ghost"}
            onClick={() => setMode("wave")}
          >
            Wave
          </Button>
          <Button
            size="sm"
            variant={mode === "blob" ? "primary" : "ghost"}
            onClick={() => setMode("blob")}
          >
            Blob
          </Button>
        </div>

        {mode === "wave" ? (
          <>
            <SliderRow
              label="Complexity"
              value={complexity}
              display={`${complexity} points`}
              min={2}
              max={8}
              onChange={setComplexity}
            />
            <SliderRow
              label="Variance"
              value={waveVariance}
              min={0}
              max={100}
              onChange={setWaveVariance}
            />
            <SliderRow
              label="Height"
              value={height}
              display={`${height}%`}
              min={10}
              max={90}
              onChange={setHeight}
            />
            <SliderRow
              label="Layers"
              value={layers}
              min={1}
              max={4}
              onChange={setLayers}
            />
            <SliderRow
              label="Opacity"
              value={opacity}
              display={opacity.toFixed(2)}
              min={0.1}
              max={1}
              step={0.05}
              onChange={setOpacity}
            />
            <ColorSwatch label="Color" value={waveColor} onChange={setWaveColor} />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={flip}
                onChange={(e) => setFlip(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Flip vertical
            </label>
          </>
        ) : (
          <>
            <SliderRow
              label="Points"
              value={points}
              min={4}
              max={12}
              onChange={setPoints}
            />
            <SliderRow
              label="Variance"
              value={blobVariance}
              min={0}
              max={100}
              onChange={setBlobVariance}
            />
            <ColorSwatch
              label={gradient ? "Gradient start" : "Color"}
              value={blobColor}
              onChange={setBlobColor}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={gradient}
                onChange={(e) => setGradient(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Gradient fill
            </label>
            {gradient && (
              <ColorSwatch
                label="Gradient end"
                value={blobColor2}
                onChange={setBlobColor2}
              />
            )}
          </>
        )}

        <div className="border-t border-border pt-4">
          <Button onClick={randomize} className="w-full">
            <Dices className="h-4 w-4" />
            Randomize
          </Button>
          <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
            seed {seed}
          </p>
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        <Panel
          title="Preview"
          actions={
            <Button size="sm" variant="secondary" onClick={download}>
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          }
        >
          <div
            className={cn(
              "overflow-hidden rounded-md border border-border bg-background",
              mode === "blob" && "mx-auto max-w-md",
            )}
          >
            <div
              className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              // Rendering the exact export string guarantees preview parity.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </Panel>

        <Panel
          title="SVG code"
          actions={
            <>
              <CopyButton text={svg} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCode((s) => !s)}
                aria-expanded={showCode}
              >
                {showCode ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {showCode ? "Hide" : "Show"}
              </Button>
            </>
          }
          bodyClassName={showCode ? undefined : "hidden"}
        >
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
            {svg}
          </pre>
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="svg-wave-generator">
      <WaveClient />
    </ToolPage>
  );
}
