import { ToolPage } from "@/components/tool/tool-page";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Download,
  Pause,
  Play,
  RotateCcw,
  Square,
  Video,
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

/** Prefer MP4 when the browser can emit it (Safari); fall back to WebM. */
const MIME_CANDIDATES = [
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

export function VideoRecorderClient() {
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

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
      setDevices(list.filter((d) => d.kind === "videoinput"));
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      teardown();
      recorderRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [clearTimer, teardown],
  );

  const finishRecording = useCallback((mimeType: string) => {
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
    chunksRef.current = [];
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    const url = URL.createObjectURL(blob);
    resultUrlRef.current = url;
    setRecording({ url, blob, ext });
    setPhase("recorded");
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    teardown();
  }, [clearTimer, teardown]);

  const start = useCallback(async () => {
    setError(null);
    setRecording(null);
    chunksRef.current = [];
    setElapsed(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: true,
      });
      streamRef.current = stream;
      // Device labels populate once permission is granted.
      void refreshDevices();

      // Mirror the live camera into the visible preview element.
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        void previewVideoRef.current.play().catch(() => {});
      }

      // Ending the camera track from the OS/browser ends the recording.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());

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
          ? "Camera access was denied. Enable it in your browser settings."
          : "Could not start the camera. Check that one is connected.",
      );
    }
    // `stop` is a stable callback; calling it from this closure is safe and
    // intentionally left out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, finishRecording, refreshDevices, teardown]);

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
    downloadBlob(recording.blob, `video-recording.${recording.ext}`);
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
          Video recording isn&rsquo;t supported in this browser. Try the latest
          Chrome, Edge, Firefox, or Safari.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Device selector */}
      <Panel title="Camera" bodyClassName="p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cam-device">Input device</Label>
          <Select
            id="cam-device"
            value={deviceId}
            disabled={isActive}
            onChange={(e) => setDeviceId(e.target.value)}
            className="max-w-md"
          >
            <option value="">System default camera</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </Select>
        </div>
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
          {/* Live camera preview while recording. */}
          <video
            ref={previewVideoRef}
            autoPlay
            muted
            playsInline
            className={isActive ? "max-h-full max-w-full" : "hidden"}
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
              <Video className="h-8 w-8" aria-hidden />
              <p className="text-sm">
                Your camera preview will appear here once recording starts.
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

export default function Screen() {
  return (
    <ToolPage slug="video-recorder">
      <VideoRecorderClient />
    </ToolPage>
  );
}
