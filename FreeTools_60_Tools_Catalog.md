# FreeTools Functional Catalog: ~60 Client-Side Utilities

This document catalogs the modular client-side functions required for the FreeTools Android application layout. Every tool runs 100% inside the local Android web view using HTML5 Web APIs, Canvas, JavaScript, or WebAssembly (WASM). No data is transmitted externally.

---

## 1. PDF Studio Module
These tools process files entirely via memory-mapped buffers using local libraries like `pdf-lib`.

1. **PDF Merge**: Aggregates array buffers of uploaded `.pdf` documents chronologically and exports a singular uncompressed `.pdf`.
2. **PDF Split**: Iterates over an uploaded document's root page catalog and breaks pages out into individual download payloads or an archive bundle.
3. **PDF Page Delete**: Targets selected integer page indices within a document array, clips them out, and repacks the remaining indices.
4. **PDF Rotate**: Modifies the global native `/Rotate` dictionary value (`90`, `180`, `270` degrees) for targeted page objects without re-encoding.
5. **PDF Extract Text**: Accesses string streams within content streams on raw text layers to parse legible typography into clean plain text.
6. **PDF Extract Images**: Traverses the page `/XObject` structure to fetch underlying raw inline bitmaps or JPEG byte chunks.
7. **PDF to Images**: Renders discrete PDF page layers into canvas graphics objects, systematically outputting them as sequential `.png` or `.jpeg` files.
8. **Images to PDF**: Reads selected local raster image files, wraps them into individual standard `/Page` size canvas sheets, and seals them into a unified PDF structure.
9. **PDF Watermark**: Superimposes a text or semi-transparent background image over targeted canvas rendering layers before compiling.
10. **PDF Encrypt / Protect**: Adds an encryption layer using basic user/owner password security parameters via RC4 or AES algorithms natively supported by modern PDF libraries.
11. **PDF Decrypt / Unlock**: Accepts an authorization string key to clear access check flags from structural headers and unlock viewing blocks.
12. **PDF Page Reorder**: Re-arrays internal target sequence arrays to alter document chronological flow dynamically before final rendering.

---

## 2. Media Studio Module
Utilizes local HTML5 media elements, AudioContext APIs, and local standalone `ffmpeg.wasm` binaries.

13. **Video Trimmer**: Feeds video streams locally into custom `ffmpeg.wasm` file-systems, using basic string parameters (`-ss` seeking and `-t` duration parameters) for instant lossy cuts.
14. **Audio Trimmer**: Extracts audio timelines into an interactive AudioContext layout buffer to clip out localized wave durations and export clean outputs.
15. **Screen Recorder**: Invokes local browser `navigator.mediaDevices.getDisplayMedia` capture pipelines, routing streams into local disk arrays via native `MediaRecorder`.
16. **Voice Recorder**: Routes standard microphone audio streams directly through input nodes into raw `.webm` or `.wav` container formats locally.
17. **Video to Audio (MP3 Converter)**: Maps video file arrays inside an internal virtual execution shell, converting video streams straight to standalone `.mp3` or `.wav` tracks.
18. **Video Speed Changer**: Changes video frame step intervals using basic speed arguments inside native processing nodes without re-indexing source pixels.
19. **Audio Mixer**: Combines independent local sound files into one synchronized multitrack output layer with simple volume node modifiers.
20. **Video Muter**: Drops specific sound stream flags inside container headers or strips out target tracks entirely to produce silent files.
21. **Video to GIF**: Decodes local video target clips and pipes them into a local JS rendering matrix (like `gifshot`) to loop standard graphics sequences.
22. **Audio Metronome**: Implements high-precision canvas click-tracks using standard scheduling intervals via the native Web Audio API clock layer.
23. **Video Aspect Ratio Changer**: Adjusts output canvas borders or adds colored edge padding using basic ffmpeg scaling scripts.

---

## 3. Image Utilities Module
Relies directly on HTML5 `<canvas>`, `FileReader`, and optimized local compression libraries.

24. **Image Compressor**: Draws image drops directly onto a local system Canvas object, running standard `.toDataURL()` quality modifiers to reduce bytes.
25. **PNG to JPG Converter**: Renders binary PNG pixel matrices directly on a white background canvas, exporting them clean as `.jpeg` blocks.
26. **JPG to PNG Converter**: Converts lossy image files into uncompressed, transparent-channel alpha formats via Canvas contexts.
27. **WebP Converter**: Encodes source raster images directly into highly efficient WebP files natively supported by modern WebView components.
28. **Image Resizer**: Adjusts bounding dimension integers using cubic sampling parameters to output modified images instantly.
29. **Image Cropper**: Uses a tracking bounding-box overlay to isolate selected target coordinate areas for clipping.
30. **Image Color Picker**: Samples underlying eye-dropper cursor pixels via Canvas coordinate maps (`getImageData`) to extract precise Hex, RGB, or HSL color codes.
31. **SVG to PNG**: Parses vector math layers into browser-native raster engines, rendering clean images to exportable pixel sizes.
32. **Exif Data Remover**: Strips data tags by cleaning out metadata headers (like APP1 markers) from raw binary file arrays.
33. **Image Inverter**: Manipulates color values on pixel arrays via fast mathematical inversion processes on a standard canvas matrix.
34. **Blur / Sharpen Filter**: Applies convolutional matrix kernel formulas directly over image grids to output visual focus adjustments locally.
35. **Grayscale Converter**: Blends color channels mathematically ($0.299R + 0.587G + 0.114B$) across canvas pixel loops to remove saturation instantly.

---

## 4. Developer & Data Formatting Module
Processes plaintext values instantly within Javascript string manipulation threads.

36. **JSON Formatter / Beautifier**: Parses text strings into clean JSON nodes, outputting readable, tab-indented nested visual tree hierarchies.
37. **JSON Minifier**: Strips out spacing characters, carriage returns, and tabs to produce highly compressed, single-line text data payloads.
38. **JSON to CSV Converter**: Flattens nested array keys systematically into standard tabular text data strings.
39. **CSV to JSON Converter**: Parses delimiter strings sequentially into key-value JavaScript data collections.
40. **Base64 Encoder / Decoder**: Utilizes built-in browser engine steps (`btoa`, `atob`) to process plain strings or binary data chunks cleanly.
41. **URL Encoder / Decoder**: Implements clean string parsing protocols (`encodeURIComponent`, `decodeURIComponent`) to process web addresses instantly.
42. **Markdown Live Preview**: Converts markdown text inputs in real time into safe HTML view layouts using standard lightweight parsing packages.
43. **Regex Tester**: Evaluates inputs against custom pattern strings, highlighting target string match collections dynamically in the UI.
44. **JWT Debugger**: Splits target token string blocks at standard periods (`.`) to decode Base64 strings into readable header and payload configurations.
45. **XML to JSON Converter**: Traverses standard document tree hierarchies to map matching data nests into structured JSON nodes.
46. **SQL Query Formatter**: Breaks down messy database strings into clean structured text segments with standardized keyword indentation rules.

---

## 5. Text & Utility Module
Handles lightweight text modifications instantly using simple, low-overhead string routines.

47. **List Sorter**: Splits inputs into array blocks via breaks, executing standard alphabetical or numeric order changes instantly.
48. **Text Case Converter**: Adjusts string data configurations quickly between standard UPPERCASE, lowercase, camelCase, or Title Case formats.
49. **Word / Character Counter**: Evaluates string sizes via standard split checks to provide fast word, sentence, and byte metrics.
50. **Diff Checker (Text Compare)**: Computes word difference changes between text blocks to output distinct colored add/delete visualizations.
51. **Lorem Ipsum Generator**: Populates test text blocks instantly using customizable paragraph parameters and standard placeholder libraries.
52. **Slug Generator**: Normalizes text strings into clean URL structures by stripping out special characters and swapping spaces for clean hyphens.
53. **Find and Replace**: Runs targeted global replacement operations across text inputs using plain strings or regular expression parameters.
54. **SHA-256 Hash Generator**: Processes text blocks locally through internal browser cryptography subsystems (`crypto.subtle.digest`).
55. **MD5 Generator**: Transforms variable-length string inputs into 128-bit checksum fingerprints via lightweight local hashing routines.

---

## 6. Mathematical & Cryptographic Tool Module
Implements direct, calculation-focused calculations entirely on device client resources.

56. **Numeric String Summation Engine**: Scans text documents to pull matching numeric integers out, running automated totaling calculations.
57. **Password Generator**: Selects characters from array sets to output high-entropy passwords via random browser number streams (`getRandomValues`).
58. **UUID Generator**: Compiles standard version-4 cryptographic ID blocks locally using automated bit manipulation steps.
59. **QR Code Generator**: Packs plain text values into standard matrix layouts, rendering crisp scannable graphics onto canvas elements.
60. **Barcode Generator**: Translates code values into geometric linear strip arrays to output standard clean barcodes instantly.
