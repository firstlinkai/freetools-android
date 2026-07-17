/* Sweeps all 100 tool routes inside the real Android WebView (via CDP). */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";

const registry = readFileSync(new URL("../src/lib/tools-registry.ts", import.meta.url), "utf8");
const slugs = [...registry.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("localhost")) ?? pages[0];

const findings = {};
let current = null;
page.on("console", (m) => {
  if (m.type() === "error") (findings[current] ??= []).push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => (findings[current] ??= []).push(`pageerror: ${e.message}`));

for (const slug of slugs) {
  current = slug;
  await page.evaluate((s) => {
    window.location.hash = `#/tools/${s}`;
  }, slug);
  await new Promise((r) => setTimeout(r, 900));
  const body = await page.evaluate(() => document.body.innerText);
  if (body.includes("This tool hit an unexpected error")) (findings[slug] ??= []).push("BOUNDARY");
  if (body.includes("Unknown tool")) (findings[slug] ??= []).push("MISSING");
  if (body.includes("Loading tool…")) {
    await new Promise((r) => setTimeout(r, 2000));
    const again = await page.evaluate(() => document.body.innerText);
    if (again.includes("Loading tool…")) (findings[slug] ??= []).push("STUCK on Suspense");
  }
}

const bad = Object.entries(findings);
console.log(`Swept ${slugs.length} tools in the Android WebView.`);
if (!bad.length) console.log("ALL CLEAN on device.");
for (const [slug, list] of bad) console.log(`■ ${slug}: ${[...new Set(list)].join(" | ")}`);
await browser.disconnect();
