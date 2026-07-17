/* Reproduce the FFmpeg "Failed to load" against the production dist.
   Opens add-text-to-video, uploads a dummy mp4 (triggers ensureLoaded),
   then watches the engine status and console. */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const tmp = process.env.TMPDIR_QA ?? ".";
const dummy = join(tmp, "dummy.mp4");
writeFileSync(dummy, Buffer.from("00000018667479706d70343200000000", "hex"));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`);
});

await page.goto(`${BASE}/#/tools/add-text-to-video`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1000));

const input = await page.$("input[type=file]");
if (!input) {
  console.log("NO FILE INPUT FOUND");
} else {
  await input.uploadFile(dummy);
  // Engine load takes a while (31MB core); poll the DOM for status text.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await page.evaluate(() => document.body.innerText.match(/Failed to load|Engine ready|Loading engine[^\n]*|ready/i)?.[0] ?? "");
    if (/Failed|ready/i.test(status)) {
      console.log(`ENGINE STATUS: ${status} (after ~${(i + 1) * 1.5}s)`);
      break;
    }
    if (i === 39) console.log(`ENGINE STATUS: timeout; last=${status}`);
  }
}
console.log("---- captured logs ----");
for (const l of logs) console.log(l);
await browser.close();
