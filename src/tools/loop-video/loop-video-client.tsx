import { ToolPage } from "@/components/tool/tool-page";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VideoWorkbench } from "../_shared/video-workbench";

export function LoopVideoClient() {
  const [loops, setLoops] = useState(2);
  return (
    <VideoWorkbench
      hint="MP4 (H.264) works best for lossless looping."
      runLabel="Loop video"
      outSuffix="looped"
      outExt="mp4"
      canRun={loops >= 1}
      // -stream_loop N repeats the input N extra times (total plays = N + 1).
      getArgs={({ input, output }) => [
        "-stream_loop", String(Math.max(0, loops - 1)),
        "-i", input,
        "-c", "copy",
        output,
      ]}
      controls={
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="loops">Total plays</Label>
          <Input
            id="loops"
            type="number"
            min={2}
            max={50}
            value={loops}
            onChange={(e) => setLoops(Math.min(50, Math.max(2, Number(e.target.value))))}
          />
        </div>
      }
      note="Looping copies the stream without re-encoding, so it's fast and lossless. Best with MP4/H.264 input."
    />
  );
}

export default function Screen() {
  return (
    <ToolPage slug="loop-video">
      <LoopVideoClient />
    </ToolPage>
  );
}
