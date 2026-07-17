/**
 * Client-side audio helpers built on the Web Audio API. Decoding and encoding
 * happen entirely in the browser; nothing is uploaded. Processing tools decode
 * a file to an AudioBuffer, transform it (often via an OfflineAudioContext),
 * then encode the result back to a downloadable WAV.
 */

let sharedCtx: AudioContext | null = null;

type WebkitWindow = typeof window & { webkitAudioContext: typeof AudioContext };

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

/** Decode an uploaded audio File into an AudioBuffer. */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  // decodeAudioData detaches the buffer, so this copy is single-use by design.
  return getAudioContext().decodeAudioData(bytes);
}

/**
 * Run an AudioBuffer through an offline graph and render the result. The
 * builder wires nodes between the provided source and the context destination.
 */
export async function renderOffline(
  buffer: AudioBuffer,
  build: (ctx: OfflineAudioContext, source: AudioBufferSourceNode) => void,
  options?: { length?: number; sampleRate?: number; channels?: number },
): Promise<AudioBuffer> {
  const sampleRate = options?.sampleRate ?? buffer.sampleRate;
  const length = options?.length ?? buffer.length;
  const channels = options?.channels ?? buffer.numberOfChannels;
  const offline = new OfflineAudioContext(channels, Math.max(1, Math.ceil(length)), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  build(offline, source);
  source.start();
  return offline.startRendering();
}

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

/** Slice an AudioBuffer to [startSec, endSec) into a fresh buffer. */
export function sliceAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const rate = buffer.sampleRate;
  const startFrame = Math.max(0, Math.floor(startSec * rate));
  const endFrame = Math.min(buffer.length, Math.floor(endSec * rate));
  const frames = Math.max(1, endFrame - startFrame);
  const out = getAudioContext().createBuffer(buffer.numberOfChannels, frames, rate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(buffer.getChannelData(c).subarray(startFrame, endFrame));
  }
  return out;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
