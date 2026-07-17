import { ToolPage } from "@/components/tool/tool-page";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Circle,
  Download,
  Mic,
  MicOff,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downloadBlob, formatBytes } from "@/lib/download";
import {
  ScreenRecorder,
  fetchRecording,
  screenRecordingAvailable,
} from "@/native/screen-recorder";

type Phase = "idle" | "recording" | "paused" | "recorded";

interface Recording {
  url: string;
  blob: Blob;
  ext: string;
}

/** Prefer MP4 when the browser can emit it (Safari); fall back to WebM. */
const MIME_CANDIDATES = [
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
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
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Inside the Android app there is no getDisplayMedia, so recording runs
 * through the native MediaProjection bridge. In a plain browser (dev server)
 * the original web capture flow still works.
 */
export function ScreenRecorderClient() {
  return screenRecordingAvailable() ? (
    <NativeScreenRecorder />
  ) : (
    <WebScreenRecorder />
  );
}

/* ------------------------------------------------------------------ */
/* Native flow: system consent dialog → native capture → mp4 preview.  */
/* ------------------------------------------------------------------ */

type NativePhase = "idle" | "starting" | "recording" | "stopping" | "recorded";

function NativeScreenRecorder() {
  const [phase, setPhase] = useState<NativePhase>("idle");
  const [withMic, setWithMic] = useState(true);
  const [micActive, setMicActive] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const phaseRef = useRef<NativePhase>("idle");
  phaseRef.current = phase;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount: end a still-running native recording and free the URL.
  useEffect(
    () => () => {
      clearTimer();
      if (phaseRef.current === "recording" || phaseRef.current === "starting") {
        void ScreenRecorder.stop().catch(() => {});
      }
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [clearTimer],
  );

  const start = useCallback(async () => {
    setError(null);
    setRecording(null);
    setElapsed(0);
    setPhase("starting");
    try {
      const res = await ScreenRecorder.start({ mic: withMic });
      setMicActive(res.mic);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    } catch (err) {
      setPhase("idle");
      const msg = err instanceof Error ? err.message : String(err);
      // The user declining the system consent dialog is not an error.
      if (!/cancell?ed/i.test(msg)) {
        setError(`Could not start screen recording: ${msg}`);
      }
    }
  }, [withMic]);

  const stop = useCallback(async () => {
    clearTimer();
    setPhase("stopping");
    try {
      const result = await ScreenRecorder.stop();
      const blob = await fetchRecording(result.webPath);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setRecording({ url, blob, ext: "mp4" });
      setPhase("recorded");
    } catch (err) {
      setPhase("idle");
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not finish the recording: ${msg}`);
    }
  }, [clearTimer]);

  const download = useCallback(() => {
    if (!recording) return;
    downloadBlob(recording.blob, `screen-recording.${recording.ext}`);
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

  const isActive = phase === "recording";

  return (
    <div className="space-y-4">
      {/* Capture options */}
      <Panel title="Capture options" bodyClassName="p-4">
        <div className="flex flex-wrap gap-2">
          <ToggleChip
            active={withMic}
            disabled={phase !== "idle" && phase !== "recorded"}
            onClick={() => setWithMic((v) => !v)}
            onIcon={<Mic className="h-4 w-4" aria-hidden />}
            offIcon={<MicOff className="h-4 w-4" aria-hidden />}
            label="Microphone"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Recording captures your whole screen through Android&rsquo;s system
          recorder. Everything stays on this device — nothing is uploaded.
        </p>
      </Panel>

      {/* Preview + status */}
      <Panel
        title="Preview"
        actions={
          isActive ? (
            <Badge className="border-danger/40 bg-danger/10 text-danger">
              <Circle className="h-2.5 w-2.5 animate-pulse fill-current" aria-hidden />
              Recording · {fmtClock(elapsed)}
            </Badge>
          ) : phase === "recorded" ? (
            <Badge>Finished · {fmtClock(elapsed)}</Badge>
          ) : undefined
        }
        bodyClassName="bg-black/90 p-0"
      >
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden">
          {phase === "recorded" && recording ? (
            <video
              src={recording.url}
              controls
              playsInline
              className="max-h-full max-w-full"
            />
          ) : isActive ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-white/80">
              <Circle className="h-8 w-8 animate-pulse fill-current text-danger" aria-hidden />
              <p className="font-mono text-2xl tabular-nums">{fmtClock(elapsed)}</p>
              <p className="text-sm text-white/60">
                Recording your screen. You can switch to any app — come back
                here and press Stop when you&rsquo;re done.
              </p>
            </div>
          ) : phase === "starting" || phase === "stopping" ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-white/70">
              <MonitorPlay className="h-8 w-8 animate-pulse" aria-hidden />
              <p className="text-sm">
                {phase === "starting" ? "Starting recorder…" : "Finishing recording…"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-white/70">
              <MonitorPlay className="h-8 w-8" aria-hidden />
              <p className="text-sm">
                Press Start and allow screen capture. Your finished recording
                will preview here.
              </p>
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
        {phase === "starting" && (
          <Button size="lg" disabled>
            <Circle className="h-4 w-4 fill-current" aria-hidden />
            Waiting for permission…
          </Button>
        )}
        {phase === "recording" && (
          <Button variant="danger" size="lg" onClick={() => void stop()}>
            <Square className="h-4 w-4 fill-current" aria-hidden />
            Stop
          </Button>
        )}
        {phase === "stopping" && (
          <Button size="lg" disabled>
            <Square className="h-4 w-4 fill-current" aria-hidden />
            Finishing…
          </Button>
        )}
        {phase === "recorded" && recording && (
          <>
            <Button size="lg" onClick={download}>
              <Download className="h-4 w-4" aria-hidden />
              Save .{recording.ext} ({formatBytes(recording.blob.size)})
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              New recording
            </Button>
          </>
        )}
      </div>

      {isActive && withMic && !micActive && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Microphone permission wasn&rsquo;t granted — recording screen video
          without mic audio.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Web flow: original getDisplayMedia capture (kept for browser dev).  */
/* ------------------------------------------------------------------ */

function WebScreenRecorder() {
  const [supported, setSupported] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [withCamera, setWithCamera] = useState(false);
  const [withMic, setWithMic] = useState(true);
  const [withSystemAudio, setWithSystemAudio] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  // Live streams and pipeline nodes, all torn down on stop/unmount.
  const displayStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  // Preview surfaces.
  const previewVideoRef = useRef<HTMLVideoElement>(null); // direct display preview
  const canvasRef = useRef<HTMLCanvasElement>(null); // composited (camera) preview
  const screenElRef = useRef<HTMLVideoElement | null>(null); // offscreen source
  const camElRef = useRef<HTMLVideoElement | null>(null); // offscreen source

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getDisplayMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardownStreams = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const ref of [displayStreamRef, camStreamRef, micStreamRef]) {
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    screenElRef.current = null;
    camElRef.current = null;
  }, []);

  // Full cleanup on unmount.
  useEffect(
    () => () => {
      clearTimer();
      teardownStreams();
      recorderRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [clearTimer, teardownStreams],
  );

  /** Mix any present audio sources (system + mic) into one output track. */
  const buildAudioTrack = useCallback((): MediaStreamTrack | null => {
    const sources: MediaStream[] = [];
    if (withSystemAudio && displayStreamRef.current?.getAudioTracks().length) {
      sources.push(new MediaStream(displayStreamRef.current.getAudioTracks()));
    }
    if (micStreamRef.current?.getAudioTracks().length) {
      sources.push(new MediaStream(micStreamRef.current.getAudioTracks()));
    }
    if (sources.length === 0) return null;
    if (sources.length === 1) return sources[0].getAudioTracks()[0];

    // More than one source → mix through a shared AudioContext.
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    const dest = ctx.createMediaStreamDestination();
    for (const s of sources) ctx.createMediaStreamSource(s).connect(dest);
    return dest.stream.getAudioTracks()[0];
  }, [withSystemAudio]);

  /** Draw the screen (and camera PiP) to the preview canvas each frame. */
  const startCompositing = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    const screenEl = screenElRef.current;
    if (!canvas || !screenEl) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.drawImage(screenEl, 0, 0, canvas.width, canvas.height);
      const camEl = camElRef.current;
      if (camEl && camEl.videoWidth > 0) {
        // Bottom-right picture-in-picture, ~24% of width, 16:9-ish.
        const pipW = Math.round(canvas.width * 0.24);
        const pipH = Math.round((pipW * camEl.videoHeight) / camEl.videoWidth);
        const x = canvas.width - pipW - 16;
        const y = canvas.height - pipH - 16;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 12;
        ctx.drawImage(camEl, x, y, pipW, pipH);
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, pipW, pipH);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  const finishRecording = useCallback((mimeType: string) => {
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunksRef.current, {
      type: mimeType || "video/webm",
    });
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
      // 1. Screen (+ optional system audio the user grants in the picker).
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: withSystemAudio,
      });
      displayStreamRef.current = display;

      // If the user stops sharing from the browser chrome, end cleanly.
      display.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      // 2. Optional microphone.
      if (withMic) {
        try {
          micStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        } catch {
          setError("Microphone was blocked — recording screen audio only.");
        }
      }

      // 3. Optional webcam for the picture-in-picture overlay.
      if (withCamera) {
        try {
          camStreamRef.current = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
          });
        } catch {
          setError("Camera was blocked — recording the screen without it.");
        }
      }

      const displayTrack = display.getVideoTracks()[0];
      const settings = displayTrack.getSettings();
      const width = settings.width ?? 1280;
      const height = settings.height ?? 720;

      // Offscreen <video> feeding the screen frames.
      const screenEl = document.createElement("video");
      screenEl.srcObject = new MediaStream([displayTrack]);
      screenEl.muted = true;
      screenEl.playsInline = true;
      await screenEl.play().catch(() => {});
      screenElRef.current = screenEl;

      // 4. Decide the recorded video track: composited canvas (camera on) or
      //    the raw display track (camera off, higher fidelity / lower CPU).
      let videoTrack: MediaStreamTrack;
      const cameraOn = withCamera && !!camStreamRef.current;
      if (cameraOn) {
        const camEl = document.createElement("video");
        camEl.srcObject = camStreamRef.current!;
        camEl.muted = true;
        camEl.playsInline = true;
        await camEl.play().catch(() => {});
        camElRef.current = camEl;
        startCompositing(width, height);
        const canvasStream = canvasRef.current!.captureStream(30);
        videoTrack = canvasStream.getVideoTracks()[0];
      } else {
        videoTrack = displayTrack;
        // Mirror the live display into the visible preview element.
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = new MediaStream([displayTrack]);
          void previewVideoRef.current.play().catch(() => {});
        }
      }

      // 5. Assemble final stream and record.
      const audioTrack = buildAudioTrack();
      const recordStream = new MediaStream(
        audioTrack ? [videoTrack, audioTrack] : [videoTrack],
      );

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        recordStream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => finishRecording(recorder.mimeType || mimeType);
      recorder.start(1000); // gather a chunk each second for resilience

      // 6. Timer ticker.
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    } catch (err) {
      teardownStreams();
      setPhase("idle");
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "Screen capture was cancelled or blocked."
          : "Could not start screen capture. Your browser may not support it.",
      );
    }
    // `stop` (declared below) is a stable callback; calling it from this
    // closure is safe and intentionally left out of the dependency list.
  }, [withCamera, withMic, withSystemAudio, buildAudioTrack, startCompositing, finishRecording, teardownStreams]);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // triggers onstop → finishRecording
    }
    teardownStreams();
    if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
  }, [clearTimer, teardownStreams]);

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
    downloadBlob(recording.blob, `screen-recording.${recording.ext}`);
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
          Screen recording isn&rsquo;t supported in this browser. Try the latest
          Chrome, Edge, or Firefox on desktop.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Capture options */}
      <Panel title="Capture options" bodyClassName="p-4">
        <div className="flex flex-wrap gap-2">
          <ToggleChip
            active={withMic}
            disabled={isActive}
            onClick={() => setWithMic((v) => !v)}
            onIcon={<Mic className="h-4 w-4" aria-hidden />}
            offIcon={<MicOff className="h-4 w-4" aria-hidden />}
            label="Microphone"
          />
          <ToggleChip
            active={withSystemAudio}
            disabled={isActive}
            onClick={() => setWithSystemAudio((v) => !v)}
            onIcon={<Volume2 className="h-4 w-4" aria-hidden />}
            offIcon={<VolumeX className="h-4 w-4" aria-hidden />}
            label="System audio"
          />
          <ToggleChip
            active={withCamera}
            disabled={isActive}
            onClick={() => setWithCamera((v) => !v)}
            onIcon={<Camera className="h-4 w-4" aria-hidden />}
            offIcon={<CameraOff className="h-4 w-4" aria-hidden />}
            label="Camera overlay"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          System audio capture is granted in the browser&rsquo;s share dialog and
          is best supported on Chrome/Edge. Everything is recorded locally — no
          stream ever leaves this tab.
        </p>
      </Panel>

      {/* Preview + status */}
      <Panel
        title="Preview"
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
        bodyClassName="bg-black/90 p-0"
      >
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden">
          {/* Composited canvas is shown while a camera overlay is active. */}
          <canvas
            ref={canvasRef}
            className={cn(
              "max-h-full max-w-full",
              withCamera && isActive ? "block" : "hidden",
            )}
          />
          {/* Direct display preview otherwise (while recording w/o camera). */}
          <video
            ref={previewVideoRef}
            muted
            playsInline
            className={cn(
              "max-h-full max-w-full",
              !withCamera && isActive ? "block" : "hidden",
            )}
          />
          {phase === "recorded" && recording && (
            <video
              src={recording.url}
              controls
              playsInline
              className="max-h-full max-w-full"
            />
          )}
          {phase === "idle" && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-white/70">
              <MonitorPlay className="h-8 w-8" aria-hidden />
              <p className="text-sm">
                Your screen preview will appear here once recording starts.
              </p>
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

/** High-contrast on/off capture toggle. */
function ToggleChip({
  active,
  disabled,
  onClick,
  onIcon,
  offIcon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-accent bg-accent-muted/40 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {active ? onIcon : offIcon}
      {label}
    </button>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="screen-recorder">
      <ScreenRecorderClient />
    </ToolPage>
  );
}
