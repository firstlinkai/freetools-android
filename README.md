# FreeTools Android

Local-first Android port of [FreeTools.click](https://www.freetools.click) — all 100
privacy-first utilities (video, audio, PDF, image, developer, text, and generator
tools) running **100% on-device** inside a hardened Capacitor WebView. No internet
permission, no analytics, no CDN fetches: every byte of every tool, including the
~31 MB FFmpeg WebAssembly core, ships inside the APK.

**Current release:** v1.0.1 — [`FreeTools-v1.0.1-release.apk`](FreeTools-v1.0.1-release.apk)
(signed, ~15 MB), tested on-device.

## Architecture

- **Frontend**: Vite + React 19 + TypeScript SPA with hash routing, dark-only
  gold-on-black theme (`#121212` / `#1E1E1E` backgrounds, `#FFD700` accents).
- **Container**: Capacitor 7 (`android/`), assets served from the app bundle via
  WebView scheme interception — the manifest deliberately has **no INTERNET
  permission**.
- **File saving**: browser downloads are bridged to Android's Storage Access
  Framework (`SaveFilePlugin`) — every tool output opens a native "Save to…"
  dialog, streamed in chunks so 100 MB+ videos work. No storage permissions.
- **Screen recording**: native `MediaProjection` plugin + foreground service
  (WebView has no `getDisplayMedia`). Mic/camera recorders use `getUserMedia`
  with on-demand runtime permissions.
- **Heavy compute**: FFmpeg WASM (local core in `public/ffmpeg/`), pdf.js worker,
  and worker-based image compression keep the UI thread at 60fps.

## Build

```bash
npm install
npm run build          # copy ffmpeg core → typecheck → vite build → offline URL scan
node scripts/check-tools.mjs   # assert all registry tools are ported
npx cap sync android
cd android && ./gradlew assembleDebug   # needs JDK 17+ and an Android SDK
```

The offline scan (`scripts/check-offline.mjs`) fails the build if any external
URL sneaks into `dist/`.

## Provenance

Ported from the open-source web version:
[github.com/firstlinkai/omnitools](https://github.com/firstlinkai/omnitools)
(read-only reference — the web app and site are unaffected by this project).

© FirstLink AI
