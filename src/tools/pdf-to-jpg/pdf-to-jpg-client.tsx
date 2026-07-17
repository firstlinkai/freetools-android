import { ToolPage } from "@/components/tool/tool-page";
import { PdfToImagesClient } from "../_shared/pdf-to-images-client";

export default function Screen() {
  return (
    <ToolPage slug="pdf-to-jpg">
      <PdfToImagesClient format="image/jpeg" ext="jpg" />
    </ToolPage>
  );
}
