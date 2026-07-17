import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToolPage } from "@/components/tool/tool-page";
import { VideoWorkbench } from "../_shared/video-workbench";

export function ChangeVideoVolumeClient() {
  const [percent, setPercent] = useState(150);
  const mult = (percent / 100).toFixed(2);
  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Boost or lower the audio without touching the picture."
      runLabel="Apply volume"
      outSuffix="volume"
      outExt="mp4"
      // Copy the video stream; only the audio is re-encoded.
      getArgs={({ input, output }) => [
        "-i", input,
        "-af", `volume=${mult}`,
        "-c:v", "copy",
        output,
      ]}
      controls={
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="vol">Volume</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <Slider
            id="vol"
            min={0}
            max={400}
            step={5}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground">
            100% keeps the original level. 0% mutes; above 100% amplifies (may clip).
          </p>
        </div>
      }
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="change-video-volume">
      <ChangeVideoVolumeClient />
    </ToolPage>
  );
}
