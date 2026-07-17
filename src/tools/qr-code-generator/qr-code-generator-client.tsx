import { ToolPage } from "@/components/tool/tool-page";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import QRCode, { type QRCodeErrorCorrectionLevel } from "qrcode";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadDataUrl } from "@/lib/download";

const EC_LEVELS: { value: QRCodeErrorCorrectionLevel; label: string }[] = [
  { value: "L", label: "L — low (7% recovery)" },
  { value: "M", label: "M — medium (15%)" },
  { value: "Q", label: "Q — quartile (25%)" },
  { value: "H", label: "H — high (30%)" },
];

const SIZES = [256, 512, 768, 1024];

/** CSS checkerboard so transparent backgrounds are visible in the preview. */
const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #3f3f46 25%, transparent 25%, transparent 75%, #3f3f46 75%), linear-gradient(45deg, #3f3f46 25%, transparent 25%, transparent 75%, #3f3f46 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
  backgroundColor: "#27272a",
};

export function QrCodeGeneratorClient() {
  const [text, setText] = useState("");
  const [ecLevel, setEcLevel] = useState<QRCodeErrorCorrectionLevel>("M");
  const [size, setSize] = useState(512);
  const [transparent, setTransparent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const options = {
    errorCorrectionLevel: ecLevel,
    width: size,
    margin: 2,
    color: {
      dark: "#000000ff",
      light: transparent ? "#00000000" : "#ffffffff",
    },
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !text) {
      setError(null);
      return;
    }
    let cancelled = false;
    QRCode.toCanvas(canvas, text, options)
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ecLevel, size, transparent]);

  const savePng = async () => {
    if (!text) return;
    try {
      const dataUrl = await QRCode.toDataURL(text, { ...options, type: "image/png" });
      downloadDataUrl(dataUrl, "qr-code.png");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Content">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={"Text or URL to encode, e.g.\nhttps://example.com"}
          className="min-h-[6rem] resize-y font-mono text-xs leading-relaxed"
          aria-label="QR code content"
        />
      </Panel>

      <Panel title="Options">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="qr-ec">Error correction</Label>
              <Select
                id="qr-ec"
                value={ecLevel}
                onChange={(e) => setEcLevel(e.target.value as QRCodeErrorCorrectionLevel)}
              >
                {EC_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="qr-size">Size (px)</Label>
              <Select id="qr-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} × {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            Transparent background (instead of white)
          </label>
          <p className="text-[11px] text-muted-foreground">
            Higher error correction keeps the code scannable when partially covered, at the cost
            of a denser pattern.
          </p>
        </div>
      </Panel>

      {error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Could not generate the QR code</p>
          <p className="mt-1 font-mono text-xs">{error}</p>
        </div>
      )}

      <Panel
        title="Preview"
        actions={
          <Button variant="secondary" size="sm" disabled={!text || !!error} onClick={savePng}>
            <Download className="h-3.5 w-3.5" />
            Save PNG
          </Button>
        }
      >
        {!text ? (
          <p className="p-2 text-sm text-muted-foreground">
            Your QR code appears here as you type. It is rendered entirely on this device.
          </p>
        ) : (
          <div
            className="flex items-center justify-center rounded-md p-4"
            style={transparent ? CHECKER_STYLE : { backgroundColor: "#ffffff" }}
          >
            <canvas
              ref={canvasRef}
              className="h-auto w-full max-w-64"
              aria-label="Generated QR code"
            />
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="qr-code-generator">
      <QrCodeGeneratorClient />
    </ToolPage>
  );
}
