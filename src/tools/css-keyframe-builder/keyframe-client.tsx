import { ToolPage } from "@/components/tool/tool-page";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { downloadText } from "@/lib/download";
import {
  DEFAULT_SETTINGS,
  DIRECTIONS,
  EASINGS,
  INITIAL_STOPS,
  ITERATIONS,
  PRESETS,
  buildCss,
  buildKeyframeBody,
  interpolateProps,
  sortStops,
  type AnimSettings,
  type Stop,
  type StopProps,
} from "./keyframes";
import { Timeline } from "./timeline";

const cloneStops = (stops: Stop[]): Stop[] =>
  stops.map((s) => ({ ...s, props: { ...s.props } }));

function PropField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return;
              onChange(Math.min(max, Math.max(min, n)));
            }}
            className="h-7 w-20 px-2 text-right font-mono text-xs"
            aria-label={`${label} value`}
          />
          {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
        </div>
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

export function KeyframeClient() {
  const [stops, setStops] = useState<Stop[]>(() => cloneStops(INITIAL_STOPS));
  const [selectedId, setSelectedId] = useState<string | null>("mid");
  const [settings, setSettings] = useState<AnimSettings>(DEFAULT_SETTINGS);

  // Fresh animation name per change so the preview restarts cleanly.
  const [version, setVersion] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReducedMotion(true);
      setPlaying(false);
    }
  }, []);

  const keyframeBody = useMemo(() => buildKeyframeBody(stops), [stops]);

  useEffect(() => {
    setVersion((v) => v + 1);
  }, [keyframeBody, settings]);

  const animName = `omni-anim-${version}`;
  const css = useMemo(() => buildCss(stops, settings), [stops, settings]);

  const selected = stops.find((s) => s.id === selectedId) ?? null;
  const selectedIsEndpoint =
    selected !== null && (selected.percent === 0 || selected.percent === 100);

  const updateSelected = (patch: Partial<StopProps>) => {
    if (!selected) return;
    setStops((prev) =>
      prev.map((s) =>
        s.id === selected.id ? { ...s, props: { ...s.props, ...patch } } : s,
      ),
    );
  };

  const addStop = (percent: number) => {
    const id = `stop-${nextId.current++}`;
    setStops((prev) => [
      ...prev,
      { id, percent, props: interpolateProps(prev, percent) },
    ]);
    setSelectedId(id);
  };

  const moveStop = (id: string, percent: number) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, percent } : s)));
  };

  const deleteSelected = () => {
    if (!selected || selectedIsEndpoint) return;
    setStops((prev) => prev.filter((s) => s.id !== selected.id));
    setSelectedId(null);
  };

  const applyPreset = (name: string) => {
    const preset = PRESETS[name];
    if (!preset) return;
    setStops(cloneStops(preset));
    setSelectedId(null);
  };

  const restart = () => {
    setVersion((v) => v + 1);
    setPlaying(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="min-w-0 space-y-4">
        <Panel title="Presets" bodyClassName="flex flex-wrap gap-1.5">
          {Object.keys(PRESETS).map((name) => (
            <Button key={name} size="sm" variant="outline" onClick={() => applyPreset(name)}>
              {name}
            </Button>
          ))}
        </Panel>

        <Panel
          title={selected ? `Keyframe at ${Math.round(selected.percent)}%` : "Keyframe"}
          actions={
            selected && !selectedIsEndpoint ? (
              <Button size="sm" variant="ghost" onClick={deleteSelected}>
                <Trash2 className="h-3.5 w-3.5 text-danger" />
                Delete
              </Button>
            ) : undefined
          }
          bodyClassName="space-y-4"
        >
          {selected ? (
            <>
              <PropField
                label="Translate X"
                value={selected.props.x}
                min={-200}
                max={200}
                step={1}
                unit="px"
                onChange={(x) => updateSelected({ x })}
              />
              <PropField
                label="Translate Y"
                value={selected.props.y}
                min={-200}
                max={200}
                step={1}
                unit="px"
                onChange={(y) => updateSelected({ y })}
              />
              <PropField
                label="Scale"
                value={selected.props.scale}
                min={0}
                max={3}
                step={0.05}
                onChange={(scale) => updateSelected({ scale })}
              />
              <PropField
                label="Rotate"
                value={selected.props.rotate}
                min={-360}
                max={360}
                step={1}
                unit="deg"
                onChange={(rotate) => updateSelected({ rotate })}
              />
              <PropField
                label="Opacity"
                value={selected.props.opacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(opacity) => updateSelected({ opacity })}
              />
              {selectedIsEndpoint && (
                <p className="text-[11px] text-muted-foreground">
                  Start and end keyframes are fixed at 0% and 100% but their
                  properties are fully editable.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a dot on the timeline to edit its transform, or click an
              empty spot on the track to add a keyframe.
            </p>
          )}
        </Panel>

        <Panel title="Animation" bodyClassName="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {settings.duration.toFixed(1)}s
              </span>
            </div>
            <Slider
              min={0.1}
              max={10}
              step={0.1}
              value={settings.duration}
              onChange={(e) =>
                setSettings((s) => ({ ...s, duration: Number(e.target.value) }))
              }
              aria-label="Duration"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kf-easing">Easing</Label>
            <Select
              id="kf-easing"
              value={settings.easing}
              onChange={(e) => setSettings((s) => ({ ...s, easing: e.target.value }))}
            >
              {EASINGS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kf-iteration">Iterations</Label>
              <Select
                id="kf-iteration"
                value={settings.iteration}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, iteration: e.target.value }))
                }
              >
                {ITERATIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kf-direction">Direction</Label>
              <Select
                id="kf-direction"
                value={settings.direction}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, direction: e.target.value }))
                }
              >
                {DIRECTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel title="Timeline" bodyClassName="space-y-1 px-4 pb-4 pt-5">
          <Timeline
            stops={stops}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addStop}
            onMove={moveStop}
          />
          <p className="text-[11px] text-muted-foreground">
            {sortStops(stops).length} keyframes. Click the track to add, drag a
            dot to retime.
          </p>
        </Panel>

        <Panel
          title="Preview"
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button size="sm" variant="ghost" onClick={restart}>
                <RotateCcw className="h-3.5 w-3.5" />
                Restart
              </Button>
            </>
          }
        >
          <style>{`@keyframes ${animName} {\n${keyframeBody}\n}`}</style>
          <div className="flex h-72 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
            <div
              className="h-16 w-16 rounded-lg bg-accent"
              style={{
                animationName: animName,
                animationDuration: `${settings.duration}s`,
                animationTimingFunction: settings.easing,
                animationIterationCount: settings.iteration,
                animationDirection: settings.direction,
                animationFillMode: "both",
                animationPlayState: playing ? "running" : "paused",
              }}
            />
          </div>
          {reducedMotion && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Your system prefers reduced motion, so the preview starts paused.
              Press Play to run it anyway.
            </p>
          )}
        </Panel>

        <Panel
          title="CSS output"
          actions={
            <>
              <CopyButton text={css} />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => downloadText(css, "animation.css", "text/css")}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </>
          }
        >
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
            {css}
          </pre>
        </Panel>
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="css-keyframe-builder">
      <KeyframeClient />
    </ToolPage>
  );
}
