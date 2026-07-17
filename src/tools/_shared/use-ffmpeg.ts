
import { useCallback, useEffect, useState } from "react";

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;
export type EngineState = "idle" | "loading" | "ready" | "error";

// FFmpeg core ships inside the app bundle (public/ffmpeg/, copied from the
// @ffmpeg/core npm package by scripts/copy-ffmpeg.mjs). Never fetched remotely.
const CORE_BASE = "/ffmpeg";
/** Approximate core size, for the progress caption before headers arrive. */
const ENGINE_SIZE = 31 * 1024 * 1024;

// The FFmpeg core is heavy (~31 MB). Load it once and share the instance across
// every video tool for the whole session.
let singleton: FFmpegInstance | null = null;
let loadPromise: Promise<FFmpegInstance> | null = null;
// The active hook instance forwards engine events to its React state.
let onRunProgress: (p: number) => void = () => {};
let onLoadProgress: (p: number) => void = () => {};

async function createEngine(): Promise<FFmpegInstance> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ff = new FFmpeg();
  ff.on("progress", ({ progress }) => {
    const p = Math.max(0, Math.min(1, progress));
    onRunProgress(Math.round(p * 100));
  });
  const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(
    `${CORE_BASE}/ffmpeg-core.wasm`,
    "application/wasm",
    true,
    ({ received, total }) => {
      const denom = total > 0 ? total : ENGINE_SIZE;
      onLoadProgress(Math.min(99, Math.round((received / denom) * 100)));
    },
  );
  await ff.load({ coreURL, wasmURL });
  return ff;
}

export function useFfmpeg() {
  const [state, setState] = useState<EngineState>(singleton ? "ready" : "idle");
  const [loadPercent, setLoadPercent] = useState(singleton ? 100 : 0);
  const [runPercent, setRunPercent] = useState(0);

  useEffect(() => {
    onLoadProgress = setLoadPercent;
    onRunProgress = setRunPercent;
  }, []);

  const ensureLoaded = useCallback(async (): Promise<FFmpegInstance> => {
    if (singleton) {
      setState("ready");
      setLoadPercent(100);
      return singleton;
    }
    if (!loadPromise) {
      setState("loading");
      setLoadPercent(0);
      loadPromise = createEngine();
      loadPromise
        .then((ff) => {
          singleton = ff;
          setState("ready");
          setLoadPercent(100);
        })
        .catch(() => {
          loadPromise = null;
          setState("error");
        });
    } else {
      setState("loading");
    }
    return loadPromise;
  }, []);

  return { state, loadPercent, runPercent, setRunPercent, ensureLoaded };
}
