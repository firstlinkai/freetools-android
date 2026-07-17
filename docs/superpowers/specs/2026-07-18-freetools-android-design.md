# FreeTools Android — Design Spec (approved 2026-07-18)

Port the FreeTools.click web utility suite (repo `firstlinkai/omnitools`, read-only reference)
into a local-first, 100% offline Android app. The web repo and live site are never modified.

## Decisions (user-approved)

| Decision | Choice |
|---|---|
| Tool set | The site's actual 60 live tools (catalog MD treated as inspiration only) |
| Architecture | Capacitor 7 + new Vite/React/TS SPA with hash routing |
| Distribution | Signed sideload APK first; Play-Store-ready later |
| Recorders | Screen recorder via native MediaProjection plugin; voice/video via WebView getUserMedia + permission bridge |
| GitHub repo | `firstlinkai/freetools-android`, private, new & separate |
| Tool screens | Lean (tool UI only; no SEO content/OG pages) |
| Theme | PRD palette, dark-only: bg `#121212`/`#1E1E1E`, accents `#FFD700`/`#F5C400` |

## Layout

```
freetools-android/
├── package.json, vite.config.ts, capacitor.config.ts, tsconfig.json, index.html
├── src/
│   ├── main.tsx, app.tsx            # HashRouter
│   ├── shell/                       # sticky search + category accordion dashboard,
│   │                                #   fullscreen tool chrome w/ back nav, ≥48dp targets
│   ├── tools/<slug>/                # 60 ported tool components (from <slug>-client.tsx)
│   ├── lib/                         # ported pdf.ts, audio.ts, utils.ts, tools-registry.ts
│   │   ├── download.ts              # rewritten → SaveFile SAF bridge (web fallback for dev)
│   │   └── ffmpeg.ts                # ported use-ffmpeg.ts; CORE_BASE → local /ffmpeg/
│   ├── native/                      # typed wrappers for Capacitor plugins
│   └── theme/                       # gold-on-black tokens
├── public/ffmpeg/                   # ffmpeg-core.js + .wasm (~31 MB) from npm, no CDN
├── scripts/check-offline.mjs        # fails build if dist/ contains external URLs
└── android/                         # Capacitor Android platform
    └── .../SaveFilePlugin.kt        # ACTION_CREATE_DOCUMENT (SAF) writer
    └── .../ScreenRecorderPlugin.kt  # MediaProjection + MediaRecorder + FGS
```

## Porting rules

- Each web tool `app/tools/<slug>/<slug>-client.tsx` copies nearly as-is; strip Next
  imports; drop `page.tsx`, `content.ts`, `opengraph-image.tsx`.
- Shared infra ports once: `_shared/` (use-ffmpeg, video-workbench, engine-status,
  images/pdf clients), `components/tool/` (dropzone, panel, copy-button),
  `lib/` helpers, tools registry (names/categories/keywords for search).
- Not ported: Stripe, @vercel/analytics, pricing/legal pages, sitemap/robots, Geist font
  (system font stack instead).

## Offline hardening

- FFmpeg core served from `public/ffmpeg/` (the app's only former CDN dependency).
- pdfjs worker already bundler-local (`new URL(...)`) — Vite bundles it.
- `scripts/check-offline.mjs` scans `dist/` for `https?://` refs; build fails on hits.
- `AndroidManifest.xml` without INTERNET permission if Capacitor's scheme-intercepted
  local serving allows it (verify at build; else keep permission — URL scan still
  guarantees no outbound calls).

## Native bridges

- **SaveFilePlugin**: JS sends bytes (chunked for large files) → SAF "Save to" dialog →
  ContentResolver write. No storage permissions needed.
- **ScreenRecorderPlugin**: MediaProjection consent → native MediaRecorder → FGS with
  `FOREGROUND_SERVICE_MEDIA_PROJECTION` → file returned to tool.
- **Mic/cam**: WebChromeClient `onPermissionRequest` + on-demand `RECORD_AUDIO`/`CAMERA`.

## Performance & memory

- FFmpeg singleton; MEMFS files deleted after each run; workers terminated on unmount.
- Heavy batch work in Web Workers; pdfjs already worker-based;
  browser-image-compression worker mode on.
- Hardware acceleration enabled; minSdk 23 (Capacitor 7 default), compile/target SDK 36/35.

## Build & verification

`vite build` → offline scan → `cap sync android` → Gradle assemble (JDK 21 at
`C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`, SDK at `D:\Android`) →
signed APK. Device testing by user with provided checklist.

## Execution

Parallel agent waves with disjoint tool-folder ownership (~8 agents × ~8 tools);
coordinator owns shared files, registry, native code, and the final build.
