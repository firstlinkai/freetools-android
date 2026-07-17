import { ToolPage } from "@/components/tool/tool-page";
import { ImagesToPdfClient } from "../_shared/images-to-pdf-client";

export default function Screen() {
  return (
    <ToolPage slug="jpg-to-pdf">
      <ImagesToPdfClient
        accept="image/jpeg,.jpg,.jpeg"
        hint="Drop one or more JPGs. Reorder them, then export a single PDF."
      />
    </ToolPage>
  );
}
