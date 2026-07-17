import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VideoWorkbench, type VideoMeta } from "../_shared/video-workbench";

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

const PRESETS: Record<string, [number, number]> = {
  "1080p": [1920, 1080],
  "720p": [1280, 720],
  "480p": [854, 480],
};

export function ResizeVideoClient() {
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const onMeta = (m: VideoMeta) => {
    if (!initialized && m.width > 0) {
      setW(m.width);
      setH(m.height);
      setInitialized(true);
    }
  };

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (p) {
      setW(p[0]);
      setH(p[1]);
    }
  };

  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Scale the video to a new resolution."
      runLabel="Resize video"
      outSuffix="resized"
      outExt="mp4"
      onMeta={onMeta}
      canRun={w > 0 && h > 0}
      getArgs={({ input, output }) => [
        "-i", input,
        "-vf", `scale=${even(w)}:${even(h)}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "copy",
        output,
      ]}
      controls={
        <div className="space-y-3">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="preset">Preset</Label>
            <Select id="preset" defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Custom</option>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="720p">720p (1280×720)</option>
              <option value="480p">480p (854×480)</option>
            </Select>
          </div>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rs-w">Width (px)</Label>
              <Input id="rs-w" type="number" min={2} value={w} onChange={(e) => setW(Math.max(2, Number(e.target.value)))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-h">Height (px)</Label>
              <Input id="rs-h" type="number" min={2} value={h} onChange={(e) => setH(Math.max(2, Number(e.target.value)))} />
            </div>
          </div>
        </div>
      }
      note="Dimensions are rounded to even pixels for H.264. Set them freely — aspect ratio isn't locked."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="resize-video">
      <ResizeVideoClient />
    </ToolPage>
  );
}
