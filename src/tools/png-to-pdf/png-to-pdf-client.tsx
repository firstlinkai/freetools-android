import { ToolPage } from "@/components/tool/tool-page";
import { ImagesToPdfClient } from "../_shared/images-to-pdf-client";

export default function Screen() {
  return (
    <ToolPage slug="png-to-pdf">
      <ImagesToPdfClient
        accept="image/png,.png"
        hint="Drop one or more PNGs. Reorder them, then export a single PDF."
      />
    </ToolPage>
  );
}
