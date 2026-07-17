import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ToolPage } from "@/components/tool/tool-page";
import { Panel } from "@/components/tool/panel";
import { CopyButton } from "@/components/tool/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Factor-based unit conversion: every unit maps to a base unit per category
 * (meters, grams, liters, m², m/s, bytes). Temperature is the one affine
 * special case and converts through Celsius.
 */
type Category = {
  name: string;
  units: { id: string; label: string; factor: number }[];
};

const CATEGORIES: Category[] = [
  {
    name: "Length",
    units: [
      { id: "mm", label: "Millimeters (mm)", factor: 0.001 },
      { id: "cm", label: "Centimeters (cm)", factor: 0.01 },
      { id: "m", label: "Meters (m)", factor: 1 },
      { id: "km", label: "Kilometers (km)", factor: 1000 },
      { id: "in", label: "Inches (in)", factor: 0.0254 },
      { id: "ft", label: "Feet (ft)", factor: 0.3048 },
      { id: "yd", label: "Yards (yd)", factor: 0.9144 },
      { id: "mi", label: "Miles (mi)", factor: 1609.344 },
    ],
  },
  {
    name: "Weight",
    units: [
      { id: "mg", label: "Milligrams (mg)", factor: 0.001 },
      { id: "g", label: "Grams (g)", factor: 1 },
      { id: "kg", label: "Kilograms (kg)", factor: 1000 },
      { id: "t", label: "Metric tons (t)", factor: 1_000_000 },
      { id: "oz", label: "Ounces (oz)", factor: 28.349523125 },
      { id: "lb", label: "Pounds (lb)", factor: 453.59237 },
      { id: "st", label: "Stone (st)", factor: 6350.29318 },
    ],
  },
  {
    name: "Temperature",
    units: [
      { id: "c", label: "Celsius (°C)", factor: 1 },
      { id: "f", label: "Fahrenheit (°F)", factor: 1 },
      { id: "k", label: "Kelvin (K)", factor: 1 },
    ],
  },
  {
    name: "Volume",
    units: [
      { id: "ml", label: "Milliliters (ml)", factor: 0.001 },
      { id: "l", label: "Liters (l)", factor: 1 },
      { id: "m3", label: "Cubic meters (m³)", factor: 1000 },
      { id: "tsp", label: "Teaspoons (US)", factor: 0.00492892159375 },
      { id: "tbsp", label: "Tablespoons (US)", factor: 0.01478676478125 },
      { id: "cup", label: "Cups (US)", factor: 0.2365882365 },
      { id: "floz", label: "Fluid ounces (US)", factor: 0.0295735295625 },
      { id: "gal", label: "Gallons (US)", factor: 3.785411784 },
    ],
  },
  {
    name: "Area",
    units: [
      { id: "cm2", label: "Square centimeters (cm²)", factor: 0.0001 },
      { id: "m2", label: "Square meters (m²)", factor: 1 },
      { id: "ha", label: "Hectares (ha)", factor: 10000 },
      { id: "km2", label: "Square kilometers (km²)", factor: 1_000_000 },
      { id: "ft2", label: "Square feet (ft²)", factor: 0.09290304 },
      { id: "ac", label: "Acres", factor: 4046.8564224 },
    ],
  },
  {
    name: "Speed",
    units: [
      { id: "ms", label: "Meters/second (m/s)", factor: 1 },
      { id: "kmh", label: "Kilometers/hour (km/h)", factor: 1 / 3.6 },
      { id: "mph", label: "Miles/hour (mph)", factor: 0.44704 },
      { id: "kn", label: "Knots (kn)", factor: 0.514444444 },
    ],
  },
  {
    name: "Data",
    units: [
      { id: "b", label: "Bytes (B)", factor: 1 },
      { id: "kb", label: "Kilobytes (KB)", factor: 1e3 },
      { id: "mb", label: "Megabytes (MB)", factor: 1e6 },
      { id: "gb", label: "Gigabytes (GB)", factor: 1e9 },
      { id: "tb", label: "Terabytes (TB)", factor: 1e12 },
      { id: "kib", label: "Kibibytes (KiB)", factor: 1024 },
      { id: "mib", label: "Mebibytes (MiB)", factor: 1024 ** 2 },
      { id: "gib", label: "Gibibytes (GiB)", factor: 1024 ** 3 },
    ],
  },
];

function toCelsius(value: number, from: string): number {
  if (from === "f") return ((value - 32) * 5) / 9;
  if (from === "k") return value - 273.15;
  return value;
}

function fromCelsius(value: number, to: string): number {
  if (to === "f") return (value * 9) / 5 + 32;
  if (to === "k") return value + 273.15;
  return value;
}

function convert(category: Category, value: number, from: string, to: string): number {
  if (category.name === "Temperature") return fromCelsius(toCelsius(value, from), to);
  const f = category.units.find((u) => u.id === from)!.factor;
  const t = category.units.find((u) => u.id === to)!.factor;
  return (value * f) / t;
}

/** Trims float noise: up to 8 significant-ish decimals, no trailing zeros. */
function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) return n.toExponential(6);
  return String(Number(n.toFixed(abs >= 1 ? 6 : 9)));
}

function UnitConverterClient() {
  const [catName, setCatName] = useState(CATEGORIES[0].name);
  const category = CATEGORIES.find((c) => c.name === catName)!;
  const [fromId, setFromId] = useState(CATEGORIES[0].units[2].id);
  const [toId, setToId] = useState(CATEGORIES[0].units[4].id);
  const [raw, setRaw] = useState("1");

  const pickCategory = (c: Category) => {
    setCatName(c.name);
    setFromId(c.units[0].id);
    setToId(c.units[1].id);
  };

  const value = parseFloat(raw.replace(",", "."));
  const result = useMemo(() => {
    if (Number.isNaN(value)) return null;
    if (!category.units.some((u) => u.id === fromId) || !category.units.some((u) => u.id === toId))
      return null;
    return convert(category, value, fromId, toId);
  }, [category, value, fromId, toId]);

  const selectClass =
    "h-12 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-ring/40";

  return (
    <div className="space-y-4">
      <Panel title="Category">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => pickCategory(c)}
              className={cn(
                "h-12 rounded-lg border px-4 text-sm font-medium",
                c.name === catName
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Convert">
        <div className="space-y-3">
          <div>
            <Label htmlFor="uc-value">Value</Label>
            <Input
              id="uc-value"
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="mt-1 h-12"
              placeholder="Enter a number"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor="uc-from">From</Label>
              <select
                id="uc-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className={cn(selectClass, "mt-1")}
              >
                {category.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              aria-label="Swap units"
              onClick={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-card active:border-accent"
            >
              <ArrowLeftRight className="h-4.5 w-4.5 text-accent" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <Label htmlFor="uc-to">To</Label>
              <select
                id="uc-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className={cn(selectClass, "mt-1")}
              >
                {category.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-4">
            <p className="min-w-0 break-all text-2xl font-semibold text-accent">
              {result === null ? "—" : formatResult(result)}
            </p>
            {result !== null && <CopyButton text={formatResult(result)} />}
          </div>
          {Number.isNaN(value) && raw.trim() !== "" && (
            <p className="text-xs text-danger">Enter a valid number.</p>
          )}
        </div>
      </Panel>

      <Panel title="Quick reference">
        <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground min-[420px]:grid-cols-2">
          {category.units
            .filter((u) => u.id !== fromId)
            .slice(0, 8)
            .map((u) => (
              <p key={u.id} className="truncate">
                {Number.isNaN(value) ? "1" : formatResult(value)}{" "}
                {category.units.find((x) => x.id === fromId)?.label.match(/\(([^)]+)\)/)?.[1] ?? ""} ={" "}
                <span className="text-foreground">
                  {Number.isNaN(value)
                    ? formatResult(convert(category, 1, fromId, u.id))
                    : formatResult(convert(category, value, fromId, u.id))}
                </span>{" "}
                {u.label.match(/\(([^)]+)\)/)?.[1] ?? u.label}
              </p>
            ))}
        </div>
      </Panel>
    </div>
  );
}

export default function Screen() {
  return (
    <ToolPage slug="unit-converter">
      <UnitConverterClient />
    </ToolPage>
  );
}
