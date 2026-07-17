import { ToolPage } from "@/components/tool/tool-page";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import JsBarcode from "jsbarcode";
import { Panel } from "@/components/tool/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { downloadDataUrl } from "@/lib/download";

type Format = "CODE128" | "EAN13" | "EAN8" | "UPC" | "CODE39" | "ITF";

interface FormatSpec {
  label: string;
  placeholder: string;
  /** Returns a friendly error message, or null when the value looks valid. */
  validate: (v: string) => string | null;
}

const FORMATS: Record<Format, FormatSpec> = {
  CODE128: {
    label: "Code 128 (any text)",
    placeholder: "e.g. ORDER-2026-0718",
    validate: (v) =>
      // eslint-disable-next-line no-control-regex
      /^[\x00-\x7F]+$/.test(v) ? null : "Code 128 supports ASCII characters only.",
  },
  EAN13: {
    label: "EAN-13",
    placeholder: "12-13 digits, e.g. 590123412345",
    validate: (v) =>
      /^\d{12,13}$/.test(v)
        ? null
        : "EAN-13 needs 12 digits (checksum added for you) or 13 digits.",
  },
  EAN8: {
    label: "EAN-8",
    placeholder: "7-8 digits, e.g. 9638507",
    validate: (v) =>
      /^\d{7,8}$/.test(v)
        ? null
        : "EAN-8 needs 7 digits (checksum added for you) or 8 digits.",
  },
  UPC: {
    label: "UPC-A",
    placeholder: "11-12 digits, e.g. 12345678901",
    validate: (v) =>
      /^\d{11,12}$/.test(v)
        ? null
        : "UPC-A needs 11 digits (checksum added for you) or 12 digits.",
  },
  CODE39: {
    label: "Code 39",
    placeholder: "e.g. ABC-1234",
    validate: (v) =>
      /^[0-9A-Z\-. $/+%]+$/.test(v)
        ? null
        : "Code 39 supports digits, UPPERCASE letters, space and - . $ / + % only.",
  },
  ITF: {
    label: "ITF (Interleaved 2 of 5)",
    placeholder: "An even number of digits, e.g. 12345678",
    validate: (v) =>
      /^\d+$/.test(v) && v.length % 2 === 0
        ? null
        : "ITF needs digits only, and an even number of them.",
  },
};

export function BarcodeGeneratorClient() {
  const [value, setValue] = useState("");
  const [format, setFormat] = useState<Format>("CODE128");
  const [barWidth, setBarWidth] = useState(2);
  const [height, setHeight] = useState(90);
  const [showValue, setShowValue] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const spec = FORMATS[format];
  const inputError = value ? spec.validate(value) : null;
  const error = inputError ?? renderError;

  useEffect(() => {
    setRenderError(null);
    const canvas = canvasRef.current;
    if (!canvas || !value || spec.validate(value) !== null) return;
    try {
      let structurallyValid = true;
      JsBarcode(canvas, value, {
        format,
        width: barWidth,
        height,
        displayValue: showValue,
        background: "#ffffff",
        lineColor: "#000000",
        margin: 12,
        fontSize: 16,
        valid: (ok) => {
          structurallyValid = ok;
        },
      });
      if (!structurallyValid) {
        setRenderError(
          `This value is not a valid ${format} code — if you typed the full number, the last (checksum) digit does not match.`,
        );
      }
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e));
    }
  }, [value, format, barWidth, height, showValue, spec]);

  const showBarcode = Boolean(value) && !error;

  const savePng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !showBarcode) return;
    downloadDataUrl(canvas.toDataURL("image/png"), `barcode-${format.toLowerCase()}.png`);
  };

  return (
    <div className="space-y-4">
      <Panel title="Value">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="bc-format">Format</Label>
              <Select
                id="bc-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
              >
                {(Object.keys(FORMATS) as Format[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMATS[f].label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="bc-value">Value to encode</Label>
              <Input
                id="bc-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
                placeholder={spec.placeholder}
                className="font-mono"
              />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Options">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="bc-width">Bar width</Label>
              <span className="font-mono text-sm text-foreground">{barWidth}px</span>
            </div>
            <Slider
              id="bc-width"
              min={1}
              max={4}
              step={0.5}
              value={barWidth}
              onChange={(e) => setBarWidth(Number(e.target.value))}
              aria-label="Bar width"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="bc-height">Height</Label>
              <span className="font-mono text-sm text-foreground">{height}px</span>
            </div>
            <Slider
              id="bc-height"
              min={40}
              max={160}
              step={5}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              aria-label="Bar height"
            />
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={showValue}
              onChange={(e) => setShowValue(e.target.checked)}
            />
            Print the value under the bars
          </label>
        </div>
      </Panel>

      {error && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">Can't render this barcode yet</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      )}

      <Panel
        title="Preview"
        actions={
          <Button variant="secondary" size="sm" disabled={!showBarcode} onClick={savePng}>
            <Download className="h-3.5 w-3.5" />
            Save PNG
          </Button>
        }
      >
        {!value ? (
          <p className="p-2 text-sm text-muted-foreground">
            Enter a value above to render the barcode. Everything happens on this device.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md bg-white p-3">
            <canvas
              ref={canvasRef}
              className={showBarcode ? "mx-auto block" : "hidden"}
              aria-label="Generated barcode"
            />
            {!showBarcode && (
              <p className="p-2 text-center text-sm text-zinc-500">
                Fix the value above to see the barcode.
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="barcode-generator">
      <BarcodeGeneratorClient />
    </ToolPage>
  );
}
