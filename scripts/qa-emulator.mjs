/* Drives the real app WebView on the emulator via CDP (adb forward must map
   127.0.0.1:9333 -> localabstract:webview_devtools_remote_<pid>).
   Verifies the FFmpeg engine reaches "Ready" inside the Android WebView. */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9333",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("localhost")) ?? pages[0];
if (!page) {
  console.log("NO PAGE TARGET FOUND");
  process.exit(1);
}
console.log(`attached: ${page.url()}`);

const logs = [];
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

// Sanity: the bundled FFmpeg core is served by the Capacitor local server.
const coreCheck = await page.evaluate(async () => {
  try {
    const r = await fetch("/ffmpeg/ffmpeg-core.js");
    const wasmHead = await fetch("/ffmpeg/ffmpeg-core.wasm");
    const blob = await wasmHead.blob();
    return `core.js ${r.status}, core.wasm ${wasmHead.status} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`;
  } catch (e) {
    return `FETCH FAILED: ${e}`;
  }
});
console.log(`asset check: ${coreCheck}`);

// Navigate to the failing tool and trigger the engine via file selection.
await page.evaluate(() => {
  window.location.hash = "#/tools/add-text-to-video";
});
await new Promise((r) => setTimeout(r, 1500));

const input = await page.$("input[type=file]");
if (!input) {
  console.log("NO FILE INPUT on add-text-to-video");
} else {
  await input.uploadFile("/data/local/tmp/dummy.mp4");
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await page.evaluate(
      () => document.body.innerText.match(/Failed to load|Ready|Loading engine[^\n]*/i)?.[0] ?? "",
    );
    if (/Failed|Ready/i.test(status)) {
      console.log(`ENGINE STATUS IN WEBVIEW: ${status} (after ~${((i + 1) * 1.5).toFixed(0)}s)`);
      break;
    }
    if (i === 59) console.log(`ENGINE STATUS: timeout; last="${status}"`);
  }
}
console.log("---- webview logs ----");
for (const l of logs.slice(0, 20)) console.log(l);
await browser.disconnect();
