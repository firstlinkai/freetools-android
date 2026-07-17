import { ToolPage } from "@/components/tool/tool-page";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FacebookPreview,
  GooglePreview,
  LinkedInPreview,
  XPreview,
  parseDomain,
  type PreviewData,
} from "./previews";

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;

const DEFAULTS = {
  title: "FreeTools, free private browser utilities",
  description:
    "Format JSON, generate SVG waves, build CSS animations, and more. Every tool runs entirely in your browser. No uploads, no tracking, no signup.",
  url: "https://www.freetools.click/tools",
};

/** Draw a simple 1200x630 gradient placeholder entirely on a local canvas. */
function makePlaceholderDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, "#6366f1");
  grad.addColorStop(1, "#06b6d4");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(1050, 90, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillText("1200 x 630", 80, 340);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillText("Placeholder social image", 80, 396);
  return canvas.toDataURL("image/png");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function Counter({ length, limit }: { length: number; limit: number }) {
  return (
    <span
      className={cn(
        "font-mono text-[11px]",
        length > limit ? "text-danger" : "text-muted-foreground",
      )}
    >
      {length}/{limit}
    </span>
  );
}

export function SocialPreviewClient() {
  const [title, setTitle] = useState(DEFAULTS.title);
  const [description, setDescription] = useState(DEFAULTS.description);
  const [url, setUrl] = useState(DEFAULTS.url);
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  // Revoke any outstanding object URL on unmount.
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const setImageSource = (next: string | null) => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setImage(next);
  };

  const onFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("That file is not an image. Drop a PNG, JPG, or WebP.");
      return;
    }
    setImageError(null);
    const next = URL.createObjectURL(file);
    setImageSource(next);
    objectUrl.current = next;
  };

  const usePlaceholder = () => {
    setImageError(null);
    const dataUrl = makePlaceholderDataUrl();
    if (!dataUrl) {
      setImageError("Could not create a canvas placeholder in this browser.");
      return;
    }
    setImageSource(dataUrl);
  };

  const data: PreviewData = { title, description, url, image };
  const domain = parseDomain(url);

  const metaSnippet = useMemo(() => {
    const t = escapeAttr(title.trim() || DEFAULTS.title);
    const d = escapeAttr(description.trim() || DEFAULTS.description);
    const u = escapeAttr(url.trim() || DEFAULTS.url);
    return [
      `<meta property="og:title" content="${t}" />`,
      `<meta property="og:description" content="${d}" />`,
      `<meta property="og:image" content="https://${parseDomain(u)}/og-image.png" />`,
      `<meta property="og:url" content="${u}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${t}" />`,
      `<meta name="twitter:description" content="${d}" />`,
    ].join("\n");
  }, [title, description, url]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="min-w-0 space-y-4">
        <Panel title="Page details" bodyClassName="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sp-title">Page title</Label>
              <Counter length={title.length} limit={TITLE_LIMIT} />
            </div>
            <Input
              id="sp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Your page title"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sp-desc">Meta description</Label>
              <Counter length={description.length} limit={DESC_LIMIT} />
            </div>
            <Textarea
              id="sp-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short summary shown under the title"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-url">URL</Label>
            <Input
              id="sp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
            />
            <p className="text-[11px] text-muted-foreground">
              Shown as <span className="font-mono">{domain}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Social image</Label>
            {image ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-md border border-border">
                  <img src={image} alt="Selected social" className="aspect-[1.91/1] w-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={usePlaceholder}>
                    <ImagePlus className="h-3.5 w-3.5" />
                    Placeholder
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setImageSource(null)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <FileDropzone
                  accept="image/*"
                  onFiles={onFiles}
                  hint="1200 x 630 recommended"
                  className="py-6"
                />
                <Button size="sm" variant="secondary" className="w-full" onClick={usePlaceholder}>
                  <ImagePlus className="h-3.5 w-3.5" />
                  Use placeholder
                </Button>
              </div>
            )}
            {imageError && <p className="text-xs text-danger">{imageError}</p>}
          </div>

          <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            These previews are visual mockups rendered locally. Platforms may crop
            or restyle cards slightly, but character limits and layouts match the
            real renderers.
          </p>
        </Panel>

        <Panel title="Meta tags" actions={<CopyButton text={metaSnippet} />}>
          <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
            {metaSnippet}
          </pre>
        </Panel>
      </div>

      <div className="min-w-0 space-y-5">
        <GooglePreview data={data} />
        <XPreview data={data} />
        <LinkedInPreview data={data} />
        <FacebookPreview data={data} />
      </div>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="social-preview">
      <SocialPreviewClient />
    </ToolPage>
  );
}
