import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Native screen recording (MediaProjection). Android WebView has no
 * getDisplayMedia, so the screen-recorder tool drives this plugin instead:
 * start() shows the system capture consent, stop() returns the finished mp4
 * from the app cache, fetchable via `webPath` for preview/saving.
 */
export interface ScreenRecorderPluginApi {
  start(options: { mic?: boolean }): Promise<{ mic: boolean }>;
  stop(): Promise<{ path: string; webPath: string; size: number }>;
  isSupported(): Promise<{ supported: boolean }>;
}

export const ScreenRecorder = registerPlugin<ScreenRecorderPluginApi>("ScreenRecorder");

export const screenRecordingAvailable = () => Capacitor.isNativePlatform();

/** Fetches the finished recording into a Blob for preview + SAF saving. */
export async function fetchRecording(webPath: string): Promise<Blob> {
  const res = await fetch(webPath);
  if (!res.ok) throw new Error(`could not read recording (${res.status})`);
  return res.blob();
}
