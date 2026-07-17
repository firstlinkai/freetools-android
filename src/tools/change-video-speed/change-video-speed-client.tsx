import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { VideoWorkbench } from "../_shared/video-workbench";

export function ChangeVideoSpeedClient() {
  const [speed, setSpeed] = useState(1.5);
  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Speed up or slow down, keeping audio in sync."
      runLabel="Change speed"
      outSuffix="speed"
      outExt="mp4"
      // setpts retimes the video; atempo retimes the audio (valid 0.5–2×).
      getArgs={({ input, output }) => [
        "-i", input,
        "-vf", `setpts=${(1 / speed).toFixed(4)}*PTS`,
        "-af", `atempo=${speed.toFixed(3)}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        output,
      ]}
      controls={
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="speed">Speed</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{speed.toFixed(2)}×</span>
          </div>
          <Slider
            id="speed"
            min={0.5}
            max={2}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground">
            0.5× is half speed (slow motion); 2× is double speed. Audio pitch is preserved.
          </p>
        </div>
      }
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="change-video-speed">
      <ChangeVideoSpeedClient />
    </ToolPage>
  );
}
