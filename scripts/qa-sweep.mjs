/* QA sweep: visits every tool route in the production preview and reports
   page errors, console errors, failed requests, error-boundary hits, and
   unknown-tool screens. Run: vite preview --port 4173, then node scripts/qa-sweep.mjs */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const registry = readFileSync(new URL("../src/lib/tools-registry.ts", import.meta.url), "utf8");
const slugs = [...registry.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();

const findings = {};
let current = null;
const note = (kind, text) => {
  if (!current) return;
  if (text.includes("favicon.ico")) return; // cosmetic, tracked separately
  (findings[current] ??= []).push(`${kind}: ${text}`);
};
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") note(`console.${m.type()}`, m.text());
});
page.on("pageerror", (e) => note("pageerror", e.message));
page.on("requestfailed", (r) => note("reqfail", `${r.url()} :: ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) note(`http${r.status()}`, r.url());
});

// Dashboard first.
current = "_dashboard";
await page.goto(`${BASE}/#/`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));

for (const slug of slugs) {
  current = slug;
  try {
    await page.goto(`${BASE}/#/tools/${slug}`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes("This tool hit an unexpected error")) note("BOUNDARY", "error boundary triggered");
    if (body.includes("Unknown tool")) note("MISSING", "unknown tool screen");
    if (body.includes("Loading tool…")) {
      await new Promise((r) => setTimeout(r, 2500));
      const again = await page.evaluate(() => document.body.innerText);
      if (again.includes("Loading tool…")) note("STUCK", "still on Suspense fallback after 4s");
    }
  } catch (e) {
    note("NAV", e.message);
  }
}

const bad = Object.entries(findings);
console.log(`Swept ${slugs.length} tools + dashboard.`);
if (!bad.length) console.log("ALL CLEAN — no errors captured.");
for (const [slug, list] of bad) {
  console.log(`\n■ ${slug}`);
  for (const l of [...new Set(list)].slice(0, 6)) console.log(`  ${l}`);
}
await browser.close();
