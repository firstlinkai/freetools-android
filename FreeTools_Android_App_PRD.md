# Product Requirement Document (PRD): FreeTools Android App (Local-First, 100% Client-Side)

## 1. Executive Summary & Objective
The objective of this project is to port the existing web utility platform, **FreeTools.click**, into a native, high-performance, 100% offline-first Android application. The core philosophy remains unchanged: **privacy-first, client-side execution, and zero data uploads.** 

The application will encapsulate the existing ~60 web utilities (PDF tools, media trimmers, image compressors, formatting utilities) into a streamlined mobile interface. The final application must function entirely without internet access, utilizing local WebAssembly (WASM) binaries and Android web view runtime capabilities.

## 2. Core Architecture & Tech Stack Strategy

### 2.1 Core Framework Option: Capacitor (Recommended) vs. Kotlin WebView
*   **Primary Directive:** To maximize code reuse from the existing Next.js / client-side JS platform while preserving hardware/file system access, the project should leverage **Capacitor (by Ionic)** or a highly optimized **Native Android Kotlin Custom WebView container**. 
*   **Capacitor Approach:** Allows bundling the web production build directly into the Android asset pipeline (`/assets/public`), running off a local `localhost` port mapping natively managed by Capacitor.
*   **Local Execution Asset Strategy:** All JS bundles, CSS, icon assets, and structural WebAssembly binaries (such as `@ffmpeg/ffmpeg` binaries or specialized image decoders) **MUST** be embedded in the local compilation package. Network fetches to remote CDNs are strictly prohibited.

### 2.2 Memory & Runtime Boundaries
*   **WebAssembly (WASM) Allocation:** Android's system WebView imposes stringent memory caps per tab/process. Heavy tools (e.g., PDF merging, video trimming via FFmpeg WASM) must explicitly handle memory optimization. Large allocations must be explicitly freed from memory (`Module._free` or proper WASM worker termination) when a tool session concludes.
*   **Hardware Acceleration:** Enable WebGL, WebGPU (where available on newer Android system WebViews), and hardware-accelerated rendering inside the Android manifest configuration to prevent lag during canvas operations or asset manipulation.

## 3. UI/UX & Mobile Adaptation Requirements

### 3.1 Layout & Navigation (Mobile-First)
The existing desktop grid matrix of ~60 tools must be transformed into a mobile-native structural layout:
*   **Dashboard / Home Screen:** A fast, indexable vertical list or dual-column grid categorized into logical tabs or accordion panels:
    *   *PDF Studio* (Merge, Split, Crop, Rotate)
    *   *Media Tools* (Trim Video, Audio Converter, Record Screen)
    *   *Image Utilities* (Convert, Compress, Resize)
    *   *Data & Formatting* (JSON Formatter, Sorters, Base64)
*   **Persistent Search Bar:** Positioned at the top of the home layout to instantly filter all 60 tools dynamically by keyword/tag as the user types.
*   **Tool Layout:** Selecting a tool opens a clean, focused fullscreen layout with a persistent "Back to Dashboard" button in the top navigation bar.

### 3.2 Themes & Styling
*   **Color Palette:** Adhere strictly to a premium, dark, low-fatigue thematic interface. Use deep blacks/charcoals (`#121212`, `#1E1E1E`) as backgrounds with vibrant gold/yellow accents (`#FFD700`, `#F5C400`) for interactive items, focus states, and primary CTA buttons.
*   **Touch Optimizations:** Interactive targets (buttons, drag-and-drop targets) must have a minimum target metric of `48dp x 48dp`. Disable text selection across non-input UI elements using CSS (`user-select: none`).

## 4. Feature Spec & Technical Implementation for Key Tools

### 4.1 Local Storage & Scoped File System Access
*   Instead of standard web browser download workflows that rely on background service downloads, the app must hook into Android's **Storage Access Framework (SAF)** or native file streams via Capacitor plugins.
*   **File Input:** Support direct selection via the native Android document picker, handling large binary files (up to 100MB+ for video files) smoothly without locking the main UI thread.
*   **File Output:** Files generated client-side by WASM or JS must trigger an explicit native "Save To" prompt or save directly to a configurable local folder (`Downloads/FreeTools`).

### 4.2 WebAssembly (WASM) & Heavy Processing Stack
*   **Video Processing (FFmpeg WASM):** Must leverage an Android-compatible multi-threaded or fallback single-threaded `ffmpeg.wasm` binary embedded inside the local assets. Ensure the script injection maps paths locally (`file:///android_asset/...` or local network proxy path).
*   **Image Compression & Conversion:** Execute purely inside a standard background Web Worker to ensure that long-running tasks (e.g., batch converting 20 PNGs to WebP) do not freeze the main UI/WebView thread.

## 5. Security, Privacy, & Sandboxing

### 5.1 Zero Telemetry & Permissions
*   **Network Isolation:** The application manifest (`AndroidManifest.xml`) should theoretically not even require the `android.permission.INTERNET` flag if built as a purely self-contained asset suite. If required for specific internal local-server bindings, all external outbound tracking, analytics (Google Analytics, Mixpanel), or crash report uploads must be structurally absent.
*   **Minimal Permissions:** Request only `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (or modern Scoped Storage alternatives like `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`) on-demand when a user initiates a file tool.

### 5.2 Storage Integrity
*   Any temporary caches generated during file conversion (e.g., virtual files written inside Emscripten's MEMFS/IDBFS filesystem) must be aggressively purged from memory and browser storage once the user navigates away from the specific tool.

## 6. Development Strategy for Claude Code

When processing this PRD to build out the application codebase, Claude Code must follow this logical sequence:
1.  **Step 1: Initialization:** Establish a Capacitor-backed wrapper project or an Android Studio project utilizing a hardened, customized Native WebView layout.
2.  **Step 2: Core Asset Extraction:** Extract the existing 60 core HTML/JS/CSS tools from the website repository, stripping out Next.js SSR-dependent routing and replacing it with client-side SPA static routing (Hash or Memory routing).
3.  **Step 3: Asset Embedding:** Bundle all tool assets and WASM modules locally into the workspace assets folder.
4.  **Step 4: Interactivity & Storage Setup:** Wire the custom file-saving architecture to translate standard browser downloads into Android system local file write actions.
5.  **Step 5: Optimization & Compilation:** Review thread allocation inside Web Workers and build the optimized production `.apk` file.
