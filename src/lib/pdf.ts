/**
 * Lazily loads pdfjs-dist on the client and wires up its worker. Kept out of
 * the SSR pass and the initial page bundle via dynamic import. Every PDF tool
 * that rasterizes pages funnels through here so the worker is configured once,
 * consistently.
 */
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}
