import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Play, Plus, Square } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const MIN_BPM = 30;
const MAX_BPM = 260;

const METERS = [
  { label: "2/4", beats: 2 },
  { label: "3/4", beats: 3 },
  { label: "4/4", beats: 4 },
  { label: "6/8", beats: 6 },
] as const;

type Meter = (typeof METERS)[number];

type WebkitWindow = typeof window & { webkitAudioContext: typeof AudioContext };

const clampBpm = (n: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));

/**
 * Look-ahead scheduler: a coarse setInterval (~25ms) wakes up and schedules
 * every click that falls within the next ~100ms on the AudioContext clock, so
 * timing is sample-accurate and immune to JS timer jitter.
 */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

export function MetronomeClient() {
  const [bpm, setBpm] = useState(120);
  const [meter, setMeter] = useState<Meter>(METERS[2]); // 4/4
  const [volume, setVolume] = useState(80);
  const [running, setRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(-1);

  // Live values the scheduler reads without re-subscribing.
  const bpmRef = useRef(bpm);
  const meterRef = useRef<Meter>(meter);
  const volumeRef = useRef(volume);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    meterRef.current = meter;
  }, [meter]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const queueRef = useRef<{ beat: number; time: number }[]>([]);
  const tapsRef = useRef<number[]>([]);

  const scheduleClick = useCallback((beat: number, time: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const accent = beat === 0;
    // In 6/8, beat 4 (index 3) gets a lighter secondary accent.
    const midAccent = !accent && meterRef.current.beats === 6 && beat === 3;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1568 : midAccent ? 1175 : 880;

    const peak = Math.max(
      0.0001,
      (volumeRef.current / 100) * 0.5 * (accent ? 1 : midAccent ? 0.85 : 0.7),
    );
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      const beats = meterRef.current.beats;
      const beat = beatRef.current % beats;
      scheduleClick(beat, nextNoteTimeRef.current);
      queueRef.current.push({ beat, time: nextNoteTimeRef.current });
      nextNoteTimeRef.current += 60 / bpmRef.current;
      beatRef.current = beat + 1;
    }
  }, [scheduleClick]);

  // rAF loop that flips the visual beat indicator exactly when each scheduled
  // click becomes audible.
  const draw = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) {
      let latest = -1;
      while (queueRef.current.length > 0 && queueRef.current[0].time <= ctx.currentTime) {
        latest = queueRef.current.shift()!.beat;
      }
      if (latest >= 0) setActiveBeat(latest);
    }
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    queueRef.current = [];
    setActiveBeat(-1);
    setRunning(false);
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }, []);

  const start = useCallback(async () => {
    if (ctxRef.current) return;
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    // WebViews often create contexts suspended; resume inside the tap gesture.
    if (ctx.state === "suspended") await ctx.resume();
    beatRef.current = 0;
    queueRef.current = [];
    nextNoteTimeRef.current = ctx.currentTime + 0.06;
    setRunning(true);
    scheduler();
    timerRef.current = window.setInterval(scheduler, LOOKAHEAD_MS);
    rafRef.current = requestAnimationFrame(draw);
  }, [scheduler, draw]);

  const toggle = useCallback(() => {
    if (ctxRef.current) stop();
    else void start();
  }, [start, stop]);

  // Full teardown on unmount.
  useEffect(() => stop, [stop]);

  const nudgeBpm = useCallback((delta: number) => {
    setBpm((b) => clampBpm(b + delta));
  }, []);

  const tapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapsRef.current;
    // A pause longer than 2s starts a fresh measurement.
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      const avgMs = sum / (taps.length - 1);
      setBpm(clampBpm(60000 / avgMs));
    }
  }, []);

  const changeMeter = useCallback((m: Meter) => {
    setMeter(m);
    // Restart the bar so the next accent lands on beat 1.
    beatRef.current = 0;
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Beat indicator ──────────────────────────────────────────── */}
      <Panel bodyClassName="flex flex-col items-center gap-5 p-6">
        <p className="text-5xl font-semibold tabular-nums text-foreground">
          {bpm}
          <span className="ml-2 text-base font-normal text-muted-foreground">BPM</span>
        </p>

        <div className="flex items-center justify-center gap-3" aria-hidden>
          {Array.from({ length: meter.beats }, (_, i) => (
            <span
              key={i}
              className={cn(
                "rounded-full transition-all duration-100",
                i === 0 ? "h-5 w-5" : "h-4 w-4",
                i === activeBeat
                  ? "scale-125 bg-accent shadow-[0_0_12px_var(--accent)]"
                  : "bg-muted",
              )}
            />
          ))}
        </div>

        <Button
          className="h-12 w-full max-w-xs"
          variant={running ? "secondary" : "primary"}
          onClick={toggle}
          aria-label={running ? "Stop metronome" : "Start metronome"}
        >
          {running ? (
            <Square className="h-4 w-4" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {running ? "Stop" : "Start"}
        </Button>
      </Panel>

      {/* ── Tempo ───────────────────────────────────────────────────── */}
      <Panel title="Tempo" bodyClassName="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            aria-label="Decrease tempo"
            onClick={() => nudgeBpm(-1)}
            disabled={bpm <= MIN_BPM}
          >
            <Minus className="h-5 w-5" aria-hidden />
          </Button>
          <Slider
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            aria-label="Tempo in beats per minute"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            aria-label="Increase tempo"
            onClick={() => nudgeBpm(1)}
            disabled={bpm >= MAX_BPM}
          >
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        <Button variant="secondary" className="h-12" onClick={tapTempo}>
          Tap tempo
        </Button>
      </Panel>

      {/* ── Meter & volume ──────────────────────────────────────────── */}
      <Panel title="Meter & sound" bodyClassName="flex flex-col gap-4 p-4">
        <div className="space-y-1.5">
          <Label id="meter-label">Time signature</Label>
          <div
            role="group"
            aria-labelledby="meter-label"
            className="grid grid-cols-4 gap-2"
          >
            {METERS.map((m) => (
              <Button
                key={m.label}
                variant={meter.label === m.label ? "primary" : "outline"}
                className="h-12"
                aria-pressed={meter.label === m.label}
                onClick={() => changeMeter(m)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Beat 1 of every bar is accented with a higher-pitched click.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="metro-volume">Volume</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{volume}%</span>
          </div>
          <Slider
            id="metro-volume"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Click volume in percent"
          />
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="metronome">
      <MetronomeClient />
    </ToolPage>
  );
}
