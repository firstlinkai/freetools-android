import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Download,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadBlob, formatBytes } from "@/lib/download";

type Phase = "idle" | "recording" | "paused" | "recorded";

interface Recording {
  url: string;
  blob: Blob;
  ext: string;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function fmtClock(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

export function VoiceRecorderClient() {
  const [supported, setSupported] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch {
      /* enumeration may fail before permission; ignored */
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      teardown();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [clearTimer, teardown],
  );

  /** Live time-domain waveform, redrawn each animation frame. */
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const data = new Uint8Array(bufferLength);

    const render = () => {
      analyser.getByteTimeDomainData(data);
      const { width, height } = canvas;
      const styles = getComputedStyle(canvas);
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = styles.getPropertyValue("--accent")?.trim() || "#6366f1";
      ctx.beginPath();
      const slice = width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = data[i] / 128; // 0..2, centered at 1
        const y = (v * height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
  }, []);

  const finishRecording = useCallback((mimeType: string) => {
    const ext = mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
        ? "m4a"
        : "webm";
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    chunksRef.current = [];
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    const url = URL.createObjectURL(blob);
    resultUrlRef.current = url;
    setRecording({ url, blob, ext });
    setPhase("recorded");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setRecording(null);
    chunksRef.current = [];
    setElapsed(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      // Device labels populate once permission is granted.
      void refreshDevices();

      // Analyser graph for the live waveform.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      drawWaveform();

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => finishRecording(recorder.mimeType || mimeType);
      recorder.start(1000);

      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    } catch (err) {
      teardown();
      setPhase("idle");
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone access was denied. Enable it in your browser settings."
          : "Could not start the microphone. Check that one is connected.",
      );
    }
  }, [deviceId, drawWaveform, finishRecording, refreshDevices, teardown]);

  const stop = useCallback(() => {
    clearTimer();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    teardown();
  }, [clearTimer, teardown]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      clearTimer();
      setPhase("paused");
    }
  }, [clearTimer]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "paused") {
      recorder.resume();
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    }
  }, []);

  const download = useCallback(() => {
    if (!recording) return;
    downloadBlob(recording.blob, `voice-recording.${recording.ext}`);
  }, [recording]);

  const reset = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setRecording(null);
    setElapsed(0);
    setError(null);
    setPhase("idle");
  }, []);

  const isActive = phase === "recording" || phase === "paused";

  if (!supported) {
    return (
      <Panel bodyClassName="p-6">
        <p className="text-sm text-danger">
          Audio recording isn&rsquo;t supported in this browser. Try the latest
          Chrome, Edge, Firefox, or Safari.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Device selector */}
      <Panel title="Microphone" bodyClassName="p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mic-device">Input device</Label>
          <Select
            id="mic-device"
            value={deviceId}
            disabled={isActive}
            onChange={(e) => setDeviceId(e.target.value)}
            className="max-w-md"
          >
            <option value="">System default microphone</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      {/* Waveform + status */}
      <Panel
        title="Waveform"
        actions={
          isActive ? (
            <Badge className="border-danger/40 bg-danger/10 text-danger">
              <Circle className="h-2.5 w-2.5 animate-pulse fill-current" aria-hidden />
              {phase === "paused" ? "Paused" : "Recording"} · {fmtClock(elapsed)}
            </Badge>
          ) : phase === "recorded" ? (
            <Badge>Finished · {fmtClock(elapsed)}</Badge>
          ) : undefined
        }
        bodyClassName="p-0"
      >
        <div className="flex h-40 w-full items-center justify-center overflow-hidden bg-muted/40">
          {isActive ? (
            <canvas ref={canvasRef} width={1200} height={160} className="h-full w-full" />
          ) : phase === "recorded" && recording ? (
            <audio src={recording.url} controls className="w-[92%]" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Mic className="h-7 w-7" aria-hidden />
              <p className="text-sm">Press record to see your live waveform.</p>
            </div>
          )}
        </div>
      </Panel>

      {/* Transport controls */}
      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" && (
          <Button size="lg" onClick={() => void start()}>
            <Circle className="h-4 w-4 fill-current" aria-hidden />
            Start recording
          </Button>
        )}
        {phase === "recording" && (
          <>
            <Button variant="secondary" onClick={pause}>
              <Pause className="h-4 w-4" aria-hidden />
              Pause
            </Button>
            <Button variant="danger" onClick={stop}>
              <Square className="h-4 w-4 fill-current" aria-hidden />
              Stop
            </Button>
          </>
        )}
        {phase === "paused" && (
          <>
            <Button onClick={resume}>
              <Play className="h-4 w-4" aria-hidden />
              Resume
            </Button>
            <Button variant="danger" onClick={stop}>
              <Square className="h-4 w-4 fill-current" aria-hidden />
              Stop
            </Button>
          </>
        )}
        {phase === "recorded" && recording && (
          <>
            <Button size="lg" onClick={download}>
              <Download className="h-4 w-4" aria-hidden />
              Download .{recording.ext} ({formatBytes(recording.blob.size)})
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              New recording
            </Button>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="voice-recorder">
      <VoiceRecorderClient />
    </ToolPage>
  );
}
