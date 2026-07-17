import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ToolPage } from "@/components/tool/tool-page";
import { VideoWorkbench } from "../_shared/video-workbench";

type Target = "mp4" | "webm" | "mov" | "mkv";

const OUT: Record<Target, { mime: string; args: string[] }> = {
  mp4: { mime: "video/mp4", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac"] },
  mov: { mime: "video/quicktime", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac"] },
  mkv: { mime: "video/x-matroska", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac"] },
  webm: { mime: "video/webm", args: ["-c:v", "libvpx", "-b:v", "1M", "-c:a", "libvorbis"] },
};

export function VideoConverterClient() {
  const [target, setTarget] = useState<Target>("mp4");
  const spec = OUT[target];
  return (
    <VideoWorkbench
      hint="Drop a video and pick a target container/codec."
      runLabel={`Convert to ${target.toUpperCase()}`}
      outSuffix="converted"
      outExt={target}
      outMime={spec.mime}
      getArgs={({ input, output }) => ["-i", input, ...spec.args, output]}
      controls={
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="target">Target format</Label>
          <Select id="target" value={target} onChange={(e) => setTarget(e.target.value as Target)}>
            <option value="mp4">MP4 (H.264 / AAC)</option>
            <option value="mov">MOV (H.264 / AAC)</option>
            <option value="mkv">MKV (H.264 / AAC)</option>
            <option value="webm">WebM (VP8 / Vorbis)</option>
          </Select>
        </div>
      }
      note="WebM (VP8) transcoding is slower than the H.264 targets. Everything runs locally on your device."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="video-converter">
      <VideoConverterClient />
    </ToolPage>
  );
}
