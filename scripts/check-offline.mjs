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
  /^https?:\/\/(www\.)?example\.(com|org|net)([/?#]|$)/, // reserved doc domain in sample text
  // Docs/help links embedded in library error-message strings — never fetched.
  /^https?:\/\/react\.dev\//,
  /^https?:\/\/reactrouter\.com\//,
  /^https?:\/\/tailwindcss\.com\/?$/, // banner comment in generated CSS
  /^https?:\/\/emscripten\.org\//, // comment inside ffmpeg-core.js
  /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/, // local origin, not a network host
  /^https?:\/\/capacitorjs\.com\//, // docs link in Capacitor runtime error strings
  /^https?:\/\/(www\.)?stuartk\.com\//, // jszip license comment
  /^https?:\/\/stuk\.github\.io\//, // jszip docs link in an error string
  /^https?:\/\/(www\.)?xfa\.org\//, // XFA XML namespaces inside pdf.js worker
  /^https?:\/\/(www\.)?freetools\.click([/?#]|$)/, // inert sample value in social-preview's URL input
  // Unreachable default: browser-image-compression's worker falls back to this
  // CDN only when no libURL is given — every call site passes a bundled libURL.
  /^https?:\/\/cdn\.jsdelivr\.net\/npm\/browser-image-compression/,
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
    // "${...}" fragments are template-literal code, not literal hosts (e.g.
    // pdf.js building intranet URLs from user data, ffmpeg's unreachable
    // default-config path — our loader always passes local core URLs).
    if (url.includes("${")) continue;
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
