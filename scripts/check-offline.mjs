/**
 * Offline enforcement: fail the build if any file in dist/ references an
 * external network URL. The app must function with zero cloud calls.
 *
 * Allowed: XML namespaces, license-comment URLs, and schema identifiers that
 * are never fetched at runtime (matched conservatively below).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const TEXT_EXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".svg", ".txt", ".webmanifest"]);

// Non-fetched identifier/namespace URLs that are safe to ship.
const ALLOWED = [
  /^https?:\/\/www\.w3\.org\//, // xmlns, SVG/XML namespaces
  /^http:\/\/ns\.adobe\.com\//, // XMP metadata namespaces (EXIF tooling)
  /^https?:\/\/purl\.org\//, // Dublin Core namespaces
  /^https?:\/\/exslt\.org\//,
  /^https?:\/\/schemas\.openxmlformats\.org\//, // OOXML namespaces (docx/xlsx writers)
  /^https?:\/\/schemas\.microsoft\.com\//,
  /^https?:\/\/[^\s"']*\bgithub\.com\/[^\s"']*$/, // license/homepage comments
  /^https?:\/\/(www\.)?mozilla\.org\/MPL\//, // license URLs
  /^https?:\/\/opensource\.org\//,
  /^https?:\/\/(www\.)?apache\.org\/licenses\//,
  // Docs/help links embedded in library error-message strings — never fetched.
  /^https?:\/\/react\.dev\//,
  /^https?:\/\/reactrouter\.com\//,
  /^https?:\/\/tailwindcss\.com\/?$/, // banner comment in generated CSS
  /^https?:\/\/emscripten\.org\//, // comment inside ffmpeg-core.js
  /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/, // local origin, not a network host
];

const URL_RE = /https?:\/\/[^\s"'`<>\\)]+/g;
const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (TEXT_EXT.has(extname(name).toLowerCase())) scan(p);
  }
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  for (const match of text.match(URL_RE) ?? []) {
    const url = match.replace(/[.,;:]+$/, "");
    if (ALLOWED.some((re) => re.test(url))) continue;
    findings.push({ file: file.slice(DIST.length + 1), url });
  }
}

walk(DIST);

if (findings.length) {
  console.error("OFFLINE CHECK FAILED — external URLs found in dist/:");
  const seen = new Set();
  for (const f of findings) {
    const key = `${f.file} :: ${f.url}`;
    if (!seen.has(key)) console.error(`  ${key}`);
    seen.add(key);
  }
  process.exit(1);
}
console.log("Offline check passed: no external URLs in dist/.");
