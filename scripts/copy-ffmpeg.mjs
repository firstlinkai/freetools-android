/**
 * Copies the FFmpeg WASM core from the @ffmpeg/core npm package into
 * public/ffmpeg/ so the app serves it from its own bundle — the web version
 * pulled these ~31 MB from unpkg, which is forbidden here (zero cloud calls).
 * Idempotent; runs as part of `npm run build`.
 */
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dest = join(root, "public", "ffmpeg");
mkdirSync(dest, { recursive: true });

const corePkg = join(root, "node_modules", "@ffmpeg", "core");
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const src = join(corePkg, "dist", "umd", file);
  copyFileSync(src, join(dest, file));
  const mb = (statSync(src).size / 1024 / 1024).toFixed(1);
  console.log(`copied ${file} (${mb} MB)`);
}
