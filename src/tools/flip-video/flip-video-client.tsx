import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VideoWorkbench } from "../_shared/video-workbench";

export function FlipVideoClient() {
  const [dir, setDir] = useState<"hflip" | "vflip">("hflip");
  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Mirror the video horizontally or vertically."
      runLabel="Flip video"
      outSuffix="flipped"
      outExt="mp4"
      getArgs={({ input, output }) => [
        "-i", input,
        "-vf", dir,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "copy",
        output,
      ]}
      controls={
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="dir">Direction</Label>
          <Select id="dir" value={dir} onChange={(e) => setDir(e.target.value as "hflip" | "vflip")}>
            <option value="hflip">Horizontal (mirror left ↔ right)</option>
            <option value="vflip">Vertical (mirror top ↕ bottom)</option>
          </Select>
        </div>
      }
      note="Flipping re-encodes the picture to H.264 MP4; audio is copied as-is."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="flip-video">
      <FlipVideoClient />
    </ToolPage>
  );
}
