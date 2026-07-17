import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Native bridge to Android's Storage Access Framework. The Kotlin side opens
 * an ACTION_CREATE_DOCUMENT "Save to…" dialog and streams the bytes to
 * whatever location the user picks — no storage permissions required.
 *
 * Files can be 100 MB+ (video output), so bytes cross the bridge in chunks
 * instead of one giant base64 payload.
 */
export interface SaveFilePluginApi {
  /** Opens the system save dialog. Rejects with message "cancelled" if dismissed. */
  begin(options: { filename: string; mime: string }): Promise<{ token: string }>;
  /** Appends one base64-encoded chunk to the opened document stream. */
  write(options: { token: string; chunk: string }): Promise<void>;
  /** Flushes and closes the stream. Returns the document URI. */
  end(options: { token: string }): Promise<{ uri: string }>;
  /** Closes and deletes a partially written document after a failure. */
  abort(options: { token: string }): Promise<void>;
}

export const SaveFile = registerPlugin<SaveFilePluginApi>("SaveFile");

export const isNative = () => Capacitor.isNativePlatform();

const CHUNK_BYTES = 6 * 1024 * 1024;

function blobChunkToBase64(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(chunk);
  });
}

/** True if the user cancelled the save dialog (not an error worth surfacing). */
export function isSaveCancelled(err: unknown): boolean {
  return err instanceof Error && /cancel/i.test(err.message);
}

/** Streams a blob to a user-chosen document via SAF. */
export async function saveBlobNative(blob: Blob, filename: string): Promise<string> {
  const mime = blob.type || "application/octet-stream";
  const { token } = await SaveFile.begin({ filename, mime });
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const chunk = blob.slice(offset, offset + CHUNK_BYTES);
      await SaveFile.write({ token, chunk: await blobChunkToBase64(chunk) });
    }
    const { uri } = await SaveFile.end({ token });
    return uri;
  } catch (err) {
    await SaveFile.abort({ token }).catch(() => {});
    throw err;
  }
}
