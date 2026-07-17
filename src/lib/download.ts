/**
 * Download helpers, bridged to Android on-device saving.
 *
 * On the native app every "download" becomes a Storage Access Framework
 * "Save to…" dialog (see src/native/save-file.ts). In a plain browser (dev
 * server) the classic anchor-download fallback keeps working. The exported
 * API is identical to the web version so ported tools need no changes.
 */
import { isNative, isSaveCancelled, saveBlobNative } from "@/native/save-file";

function downloadBlobWeb(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBlob(blob: Blob, filename: string) {
  if (!isNative()) {
    downloadBlobWeb(blob, filename);
    return;
  }
  void saveBlobNative(blob, filename).catch((err) => {
    if (isSaveCancelled(err)) return;
    console.error("Save failed:", err);
    alert(`Could not save ${filename}: ${err instanceof Error ? err.message : err}`);
  });
}

export function downloadText(text: string, filename: string, mime = "text/plain") {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  if (!isNative()) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  // data:<mime>;base64,<payload> → Blob, then through the native save path.
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const mime = meta.slice(5, meta.indexOf(";") === -1 ? undefined : meta.indexOf(";")) || "application/octet-stream";
  const bytes = Uint8Array.from(atob(dataUrl.slice(comma + 1)), (c) => c.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: mime }), filename);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
