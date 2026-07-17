import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VideoWorkbench, type VideoMeta } from "../_shared/video-workbench";

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export function CropVideoClient() {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
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

  const field = (
    id: string,
    label: string,
    value: number,
    set: (n: number) => void,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => set(Math.max(0, Number(e.target.value)))}
      />
    </div>
  );

  return (
    <VideoWorkbench
      hint="MP4, MOV, or WebM. Crop to a rectangular region of the frame."
      runLabel="Crop video"
      outSuffix="cropped"
      outExt="mp4"
      onMeta={onMeta}
      canRun={w > 0 && h > 0}
      getArgs={({ input, output }) => [
        "-i", input,
        "-vf", `crop=${even(w)}:${even(h)}:${Math.floor(x)}:${Math.floor(y)}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "copy",
        output,
      ]}
      controls={
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field("crop-w", "Width (px)", w, setW)}
          {field("crop-h", "Height (px)", h, setH)}
          {field("crop-x", "Left offset (px)", x, setX)}
          {field("crop-y", "Top offset (px)", y, setY)}
        </div>
      }
      note="Offsets are measured from the top-left corner. Values are rounded to even pixels for H.264."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="crop-video">
      <CropVideoClient />
    </ToolPage>
  );
}
