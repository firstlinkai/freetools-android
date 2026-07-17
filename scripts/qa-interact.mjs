/* Interaction QA for the worker-based pipelines that only initialize on file
   upload: pdf.js (split-pdf), browser-image-compression (compress-png), and a
   canvas generator sanity check (qr-code-generator). */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const dir = tmpdir();

// Minimal one-page valid PDF.
const pdfPath = join(dir, "qa-tiny.pdf");
writeFileSync(
  pdfPath,
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
164
%%EOF`,
);

// 1x1 red PNG.
const pngPath = join(dir, "qa-tiny.png");
writeFileSync(
  pngPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const logs = [];
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) logs.push(`[console.error] ${m.text()}`);
});

async function tryTool(slug, filePath, expectRe, waitMs = 8000) {
  logs.length = 0;
  await page.goto(`${BASE}/#/tools/${slug}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  if (filePath) {
    const input = await page.$("input[type=file]");
    if (!input) return console.log(`${slug}: NO FILE INPUT`);
    await input.uploadFile(filePath);
  }
  const deadline = Date.now() + waitMs;
  let matched = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    const body = await page.evaluate(() => document.body.innerText);
    if (expectRe.test(body)) {
      matched = true;
      break;
    }
  }
  console.log(`${slug}: ${matched ? "OK" : "EXPECTATION NOT MET"}${logs.length ? " | " + logs.join(" ; ") : ""}`);
  if (!matched) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log(`  body: ${body.replace(/\n+/g, " | ")}`);
  }
}

await tryTool("split-pdf", pdfPath, /1 page|page 1|pages?\b/i);
await tryTool("compress-png", pngPath, /compress|result|smaller|save|download/i);

// QR: type into the text input and expect a canvas to appear.
logs.length = 0;
await page.goto(`${BASE}/#/tools/qr-code-generator`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 800));
const field = (await page.$("textarea")) ?? (await page.$("input[type=text]")) ?? (await page.$("input:not([type=file])"));
if (field) {
  await field.type("https://www.freetools.click");
  await new Promise((r) => setTimeout(r, 1500));
  const hasCanvas = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return false;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 200) return true;
    return false;
  });
  console.log(`qr-code-generator: ${hasCanvas ? "OK (canvas painted)" : "CANVAS EMPTY"}${logs.length ? " | " + logs.join(" ; ") : ""}`);
} else {
  console.log("qr-code-generator: NO TEXT INPUT FOUND");
}

await browser.close();
