import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VideoWorkbench, type VideoMeta } from "../_shared/video-workbench";

type RatioKey = "16:9" | "9:16" | "1:1" | "4:3" | "21:9";

const RATIOS: Record<RatioKey, { w: number; h: number; label: string }> = {
  "16:9": { w: 16, h: 9, label: "16:9 — widescreen / YouTube" },
  "9:16": { w: 9, h: 16, label: "9:16 — vertical / Reels, Shorts" },
  "1:1": { w: 1, h: 1, label: "1:1 — square / feed posts" },
  "4:3": { w: 4, h: 3, label: "4:3 — classic TV" },
  "21:9": { w: 21, h: 9, label: "21:9 — cinematic ultrawide" },
};

const RATIO_ORDER: RatioKey[] = ["16:9", "9:16", "1:1", "4:3", "21:9"];

function isValidHex(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

/** "#rrggbb" / "rrggbb" → FFmpeg's 0xRRGGBB color syntax. */
function toFfmpegColor(value: string): string {
  return `0x${value.trim().replace(/^#/, "")}`;
}

/**
 * Compute the padded canvas for a target ratio. Only ever grows the frame
 * (letterbox/pillarbox — no cropping) and keeps dimensions even for H.264.
 */
function padSize(meta: VideoMeta, ratio: RatioKey): { w: number; h: number } {
  const r = RATIOS[ratio].w / RATIOS[ratio].h;
  let w = meta.width;
  let h = meta.height;
  if (w / h < r) {
    w = Math.ceil(h * r);
  } else {
    h = Math.ceil(w / r);
  }
  // libx264 needs even dimensions; rounding up never crops.
  w += w % 2;
  h += h % 2;
  return { w, h };
}

export function VideoAspectRatioClient() {
  const [ratio, setRatio] = useState<RatioKey>("16:9");
  const [hex, setHex] = useState("#000000");
  const [meta, setMeta] = useState<VideoMeta | null>(null);

  const hexOk = isValidHex(hex);
  const target = meta && meta.width > 0 ? padSize(meta, ratio) : null;

  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Letterboxes to the new ratio — nothing is cropped."
      runLabel="Change aspect ratio"
      outSuffix={`${RATIOS[ratio].w}x${RATIOS[ratio].h}`}
      outExt="mp4"
      canRun={hexOk && meta !== null && meta.width > 0}
      onMeta={setMeta}
      // pad grows the canvas to the target ratio and centers the frame on the
      // chosen background color; the picture itself is never scaled or cropped.
      getArgs={({ input, output, meta: m }) => {
        const { w, h } = padSize(m, ratio);
        return [
          "-i", input,
          "-vf", `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${toFfmpegColor(hexOk ? hex : "#000000")}`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "copy",
          output,
        ];
      }}
      controls={
        <div className="flex flex-col gap-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="ratio">Target ratio</Label>
            <Select id="ratio" value={ratio} onChange={(e) => setRatio(e.target.value as RatioKey)}>
              {RATIO_ORDER.map((key) => (
                <option key={key} value={key}>
                  {RATIOS[key].label}
                </option>
              ))}
            </Select>
            {target && meta && (
              <p className="text-[11px] text-muted-foreground">
                {meta.width}×{meta.height} → {target.w}×{target.h}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pad-color">Pad color</Label>
            <div className="flex items-center gap-2">
              <input
                id="pad-color-picker"
                type="color"
                aria-label="Pick pad color"
                value={hexOk ? `#${hex.trim().replace(/^#/, "").toLowerCase()}` : "#000000"}
                onChange={(e) => setHex(e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
              />
              <Input
                id="pad-color"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                placeholder="#000000"
                className="w-28 font-mono"
              />
            </div>
            {!hexOk && (
              <p className="text-[11px] text-danger">Enter a 6-digit hex color, e.g. #000000.</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Fills the letterbox bars. Black is the default; white or a brand color also works.
            </p>
          </div>
        </div>
      }
      note="Padding re-encodes the picture to H.264 MP4; audio is copied as-is."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="video-aspect-ratio">
      <VideoAspectRatioClient />
    </ToolPage>
  );
}
