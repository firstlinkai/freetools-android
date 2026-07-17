
import { Globe, ImageOff } from "lucide-react";

/**
 * Pixel-faithful CSS mockups of the four link-card renderers.
 * These intentionally use fixed light backgrounds and hard-coded platform
 * colors so they look like the real platforms regardless of the app theme.
 */

export interface PreviewData {
  title: string;
  description: string;
  url: string;
  image: string | null;
}

/** Truncate at a platform's real character limit with an ellipsis. */
export function clip(text: string, limit: number): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  return `${t.slice(0, limit - 1).trimEnd()}…`;
}

export function parseDomain(url: string): string {
  const raw = url.trim();
  if (!raw) return "example.com";
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname;
    return host.replace(/^www\./, "") || "example.com";
  } catch {
    return "example.com";
  }
}

function breadcrumb(url: string): string {
  const raw = url.trim();
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length > 0
      ? `https://${host} › ${parts.join(" › ")}`
      : `https://${host}`;
  } catch {
    return "https://example.com";
  }
}

function MockImage({
  image,
  alt,
  className,
}: {
  image: string | null;
  alt: string;
  className: string;
}) {
  if (!image) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#e9ebee]`}>
        <span className="flex flex-col items-center gap-1 text-[#8a8d91]">
          <ImageOff className="h-6 w-6" aria-hidden />
          <span className="text-xs">No image</span>
        </span>
      </div>
    );
  }
  return <img src={image} alt={alt} className={`${className} object-cover`} />;
}

function MockFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="rounded-lg border border-border bg-white p-4">{children}</div>
    </div>
  );
}

export function GooglePreview({ data }: { data: PreviewData }) {
  const domain = parseDomain(data.url);
  return (
    <MockFrame label="Google Search">
      <div className="max-w-[600px] font-[arial,sans-serif]">
        <div className="flex items-center gap-3">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#ecedef] bg-[#f1f3f4]">
            <Globe className="h-3.5 w-3.5 text-[#5f6368]" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm text-[#202124]">{domain}</p>
            <p className="truncate text-xs text-[#4d5156]">{breadcrumb(data.url)}</p>
          </div>
        </div>
        <p className="mt-1.5 truncate text-xl leading-6 text-[#1a0dab]">
          {clip(data.title || "Untitled page", 60)}
        </p>
        <p className="mt-1 text-sm leading-[1.58] text-[#4d5156]">
          {clip(data.description || "No description provided for this page.", 160)}
        </p>
      </div>
    </MockFrame>
  );
}

export function XPreview({ data }: { data: PreviewData }) {
  const domain = parseDomain(data.url);
  return (
    <MockFrame label="X (Twitter)">
      <div className="max-w-[516px] overflow-hidden rounded-2xl border border-[#cfd9de] font-[system-ui,sans-serif]">
        <MockImage image={data.image} alt="Link preview" className="aspect-[1.91/1] w-full" />
        <div className="space-y-0.5 border-t border-[#cfd9de] px-3 py-2.5">
          <p className="truncate text-[13px] leading-4 text-[#536471]">{domain}</p>
          <p className="truncate text-[15px] font-normal leading-5 text-[#0f1419]">
            {clip(data.title || "Untitled page", 70)}
          </p>
          <p className="line-clamp-2 text-[13px] leading-4 text-[#536471]">
            {clip(data.description || "No description provided.", 125)}
          </p>
        </div>
      </div>
    </MockFrame>
  );
}

export function LinkedInPreview({ data }: { data: PreviewData }) {
  const domain = parseDomain(data.url);
  return (
    <MockFrame label="LinkedIn">
      <div className="max-w-[552px] overflow-hidden rounded-[2px] border border-[#e8e8e8] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.02)] font-[system-ui,sans-serif]">
        <MockImage image={data.image} alt="Link preview" className="aspect-[1.91/1] w-full" />
        <div className="bg-[#eef3f8] px-3 py-2.5">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-[rgba(0,0,0,0.9)]">
            {clip(data.title || "Untitled page", 120)}
          </p>
          <p className="mt-1 truncate text-xs text-[rgba(0,0,0,0.6)]">{domain}</p>
        </div>
      </div>
    </MockFrame>
  );
}

export function FacebookPreview({ data }: { data: PreviewData }) {
  const domain = parseDomain(data.url);
  return (
    <MockFrame label="Facebook">
      <div className="max-w-[524px] overflow-hidden border border-[#dddfe2] font-[helvetica,arial,sans-serif]">
        <MockImage image={data.image} alt="Link preview" className="aspect-[1.91/1] w-full" />
        <div className="border-t border-[#dddfe2] bg-[#f2f3f5] px-3 py-2.5">
          <p className="truncate text-[13px] uppercase leading-4 text-[#606770]">{domain}</p>
          <p className="mt-1 truncate text-[16px] font-semibold leading-5 text-[#1d2129]">
            {clip(data.title || "Untitled page", 88)}
          </p>
          <p className="truncate text-sm leading-5 text-[#606770]">
            {clip(data.description || "No description provided.", 110)}
          </p>
        </div>
      </div>
    </MockFrame>
  );
}
