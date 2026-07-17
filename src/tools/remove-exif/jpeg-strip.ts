/**
 * Lossless JPEG metadata strip: rewrites the segment stream, dropping every
 * APP1–APP15 segment (EXIF, XMP, ICC, Photoshop, Adobe…) and COM comments
 * while keeping APP0 (JFIF) and everything the decoder needs. Image entropy
 * data is copied byte-for-byte, so pixels are untouched.
 */

export interface StrippedSegment {
  /** e.g. "APP1 (Exif)" */
  label: string;
  bytes: number;
}

export interface StripResult {
  out: Uint8Array;
  removed: StrippedSegment[];
}

const APP1_KINDS: [string, string][] = [
  ["Exif\0", "Exif"],
  ["http://ns.adobe.com/xap/", "XMP"],
];

function segmentLabel(marker: number, bytes: Uint8Array, bodyStart: number): string {
  if (marker === 0xfe) return "COM (comment)";
  const n = marker - 0xe0;
  if (marker === 0xe1) {
    const head = String.fromCharCode(...bytes.subarray(bodyStart, bodyStart + 24));
    for (const [prefix, kind] of APP1_KINDS) {
      if (head.startsWith(prefix)) return `APP1 (${kind})`;
    }
    return "APP1";
  }
  if (marker === 0xe2) {
    const head = String.fromCharCode(...bytes.subarray(bodyStart, bodyStart + 12));
    if (head.startsWith("ICC_PROFILE")) return "APP2 (ICC profile)";
    return "APP2";
  }
  if (marker === 0xed) return "APP13 (Photoshop/IPTC)";
  if (marker === 0xee) return "APP14 (Adobe)";
  return `APP${n}`;
}

/** Returns null if the bytes are not a parseable JPEG. */
export function stripJpegMetadata(bytes: Uint8Array): StripResult | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const kept: [number, number][] = [[0, 2]]; // SOI
  const removed: StrippedSegment[] = [];
  let i = 2;

  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) return null; // lost sync — bail, keep original
    // Skip fill bytes (0xFF padding before a marker).
    if (bytes[i + 1] === 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];

    // Standalone markers (no length field).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push([i, i + 2]);
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      // EOI (unusual before SOS, but keep the tail as-is).
      kept.push([i, bytes.length]);
      i = bytes.length;
      break;
    }
    if (marker === 0xda) {
      // SOS: entropy-coded data follows; copy everything to the end verbatim.
      kept.push([i, bytes.length]);
      i = bytes.length;
      break;
    }

    if (i + 4 > bytes.length) return null;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) return null;
    const segEnd = i + 2 + len;

    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (isMetadata) {
      removed.push({ label: segmentLabel(marker, bytes, i + 4), bytes: segEnd - i });
    } else {
      kept.push([i, segEnd]);
    }
    i = segEnd;
  }

  const total = kept.reduce((sum, [a, b]) => sum + (b - a), 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const [a, b] of kept) {
    out.set(bytes.subarray(a, b), offset);
    offset += b - a;
  }
  return { out, removed };
}
