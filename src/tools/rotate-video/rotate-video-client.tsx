import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VideoWorkbench } from "../_shared/video-workbench";

const TRANSPOSE: Record<string, string> = {
  "90": "transpose=1",
  "180": "transpose=2,transpose=2",
  "270": "transpose=2",
};

export function RotateVideoClient() {
  const [angle, setAngle] = useState("90");
  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Rotate footage shot at the wrong angle."
      runLabel="Rotate video"
      outSuffix="rotated"
      outExt="mp4"
      getArgs={({ input, output }) => [
        "-i", input,
        "-vf", TRANSPOSE[angle],
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "copy",
        output,
      ]}
      controls={
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="angle">Rotation</Label>
          <Select id="angle" value={angle} onChange={(e) => setAngle(e.target.value)}>
            <option value="90">90° clockwise</option>
            <option value="180">180°</option>
            <option value="270">90° counter-clockwise</option>
          </Select>
        </div>
      }
      note="Rotating re-encodes the picture to H.264 MP4; audio is copied as-is."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="rotate-video">
      <RotateVideoClient />
    </ToolPage>
  );
}
